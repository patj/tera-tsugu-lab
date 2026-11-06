// 期間内に年忌を迎える故人の一覧（spec.md §4 の list_upcoming_memorials。台本の場面 1）
//
// 判定の基準（01-ledger.md【決定】）: その年の祥月命日が期間 [from, to] に入る故人を数える。
// 回忌が宗派プリセットの年忌の一覧に入るものだけを返す。離檀・転出の世帯は含めない。
import { and, eq, isNotNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { households, persons } from "@/db/schema";
import { getTemple, invalid, parseDateString, type Actor } from "@/domain/core";
import { assertStaff, fullName } from "./common";
import { memorialInYear } from "./kaiki";

export type UpcomingMemorialItem = {
  personId: string;
  name: string;
  kana: string | null;
  /** 法号 */
  homyo: string | null;
  relation: string | null;
  deathDate: string;
  ageAtDeath: number | null;
  kaiki: number;
  kaikiName: string;
  /** 期間に入る祥月命日（"YYYY-MM-DD"） */
  meinichi: string;
  household: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    contactPersonName: string | null;
  };
  /** 同じ世帯で、同じ年に年忌を迎えるほかの故人（複数霊位供養の候補） */
  sameYearInHousehold: { personId: string; name: string; kaiki: number; kaikiName: string; meinichi: string }[];
};

export type UpcomingMemorialGroup = {
  kaiki: number;
  kaikiName: string;
  count: number;
  items: UpcomingMemorialItem[];
};

export type UpcomingMemorials = {
  from: string;
  to: string;
  total: number;
  /** 回忌の小さい順。各回忌の中は祥月命日の順 */
  groups: UpcomingMemorialGroup[];
};

/** 期間の長さの上限（年をまたぐ指定は受け付けるが、極端に長い期間は断る） */
const MAX_RANGE_YEARS = 3;

/** 期間（"YYYY-MM-DD"、両端を含む）に祥月命日が来て、年忌を迎える故人を、回忌ごとにまとめて返す */
export async function listUpcomingMemorials(
  actor: Actor,
  range: { from: string; to: string; /** 回忌で絞る（一周忌は 2） */ kaiki?: number | null },
  conn: DbOrTx = db,
): Promise<UpcomingMemorials> {
  assertStaff(actor);
  let fromYear: number;
  let toYear: number;
  try {
    fromYear = parseDateString(range.from).year;
    toYear = parseDateString(range.to).year;
  } catch (e) {
    throw invalid(e instanceof Error ? e.message : "期間は YYYY-MM-DD の形で指定してください");
  }
  if (range.from > range.to) throw invalid("期間の始まりが終わりより後になっています");
  if (toYear - fromYear > MAX_RANGE_YEARS) throw invalid(`期間は ${MAX_RANGE_YEARS} 年までにしてください`);

  const preset = (await getTemple(actor.templeId, conn)).preset;
  const rows = await conn
    .select({ p: persons, h: households })
    .from(persons)
    .innerJoin(households, eq(households.id, persons.householdId))
    .where(
      and(
        eq(persons.templeId, actor.templeId),
        eq(persons.isDeceased, true),
        isNotNull(persons.deathDate),
        eq(households.status, "active"),
      ),
    );

  const contactIds = new Map<string, string>();
  for (const { p } of rows) contactIds.set(p.id, fullName(p));
  const contactNameOf = async (id: string | null): Promise<string | null> => {
    if (!id) return null;
    if (contactIds.has(id)) return contactIds.get(id)!;
    const [c] = await conn.select().from(persons).where(eq(persons.id, id));
    const n = c ? fullName(c) : null;
    if (n) contactIds.set(id, n);
    return n;
  };

  const items: UpcomingMemorialItem[] = [];
  for (const { p, h } of rows) {
    for (let year = fromYear; year <= toYear; year++) {
      const m = memorialInYear(p.deathDate!, year, preset);
      if (!m || m.meinichi < range.from || m.meinichi > range.to) continue;
      if (range.kaiki && m.kaiki !== range.kaiki) continue;
      const sameYear = rows
        .filter((o) => o.p.householdId === p.householdId && o.p.id !== p.id)
        .flatMap((o) => {
          const om = memorialInYear(o.p.deathDate!, year, preset);
          return om
            ? [{ personId: o.p.id, name: fullName(o.p), kaiki: om.kaiki, kaikiName: om.kaikiName, meinichi: om.meinichi }]
            : [];
        });
      items.push({
        personId: p.id,
        name: fullName(p),
        kana: p.kana,
        homyo: p.homyo,
        relation: p.relation,
        deathDate: p.deathDate!,
        ageAtDeath: p.ageAtDeath,
        kaiki: m.kaiki,
        kaikiName: m.kaikiName,
        meinichi: m.meinichi,
        household: {
          id: h.id,
          name: h.name,
          phone: h.phone,
          address: h.address,
          contactPersonName: await contactNameOf(h.contactPersonId),
        },
        sameYearInHousehold: sameYear,
      });
    }
  }

  const byKaiki = new Map<number, UpcomingMemorialItem[]>();
  for (const it of items) byKaiki.set(it.kaiki, [...(byKaiki.get(it.kaiki) ?? []), it]);
  const groups = [...byKaiki.entries()]
    .sort(([a], [b]) => a - b)
    .map(([kaiki, list]) => ({
      kaiki,
      kaikiName: list[0].kaikiName,
      count: list.length,
      items: list.sort((a, b) => a.meinichi.localeCompare(b.meinichi) || a.name.localeCompare(b.name)),
    }));
  return { from: range.from, to: range.to, total: items.length, groups };
}
