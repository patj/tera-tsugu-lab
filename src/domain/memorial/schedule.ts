// 家の法要の予定（ポータルの「法要の予定」）と、申し込みフォームの回忌の提案（spec.md §2.1、§3.1）
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { memorialServices, memorialServiceTargets, persons } from "@/db/schema";
import { getTemple, invalid, jst, notFound, parseDateString, todayJst } from "@/domain/core";
import { isMemorialKaiki, kaikiName, kaikiOfYear, memorialsBetweenYears } from "@/domain/ledger";
import { fullName, isUuid, personsByIds, staffByIds, staffLabel } from "./common";
import type { MemorialLocation } from "./types";

export type HouseholdMemorialSchedule = {
  /** 確定（scheduled）の法要で、今日以降のもの（日時の順） */
  confirmed: {
    id: string;
    startAt: Date;
    location: MemorialLocation;
    officiantName: string;
    targets: { personId: string; name: string; kaiki: number; kaikiName: string }[];
  }[];
  /** 今後の年忌の目安（祥月命日の順。確定・済みの法要がある年忌は除く） */
  upcoming: {
    personId: string;
    name: string;
    homyo: string | null;
    relation: string | null;
    year: number;
    kaiki: number;
    kaikiName: string;
    /** その年の祥月命日（"YYYY-MM-DD"） */
    meinichi: string;
  }[];
};

/**
 * 家の法要の予定。06 のポータルが使う。権限の確認は呼ぶ側で行う。
 * upcoming は、祥月命日が today 以降で、today から years 年の内に来る年忌（初期値 3 年）
 */
export async function getHouseholdMemorialSchedule(
  householdId: string,
  opts: { today?: string; years?: number } = {},
  conn: DbOrTx = db,
): Promise<HouseholdMemorialSchedule> {
  if (!isUuid(householdId)) return { confirmed: [], upcoming: [] };
  const today = opts.today ?? todayJst();
  const years = Math.max(1, Math.min(opts.years ?? 3, 50));
  const thisYear = parseDateString(today).year;
  const until = `${thisYear + years}${today.slice(4)}`;

  const deceased = await conn
    .select()
    .from(persons)
    .where(and(eq(persons.householdId, householdId), eq(persons.isDeceased, true)));

  // 確定・済みの法要（取り消しは除く）の、故人ごとの回忌
  const services = await conn
    .select()
    .from(memorialServices)
    .where(and(eq(memorialServices.householdId, householdId), ne(memorialServices.status, "cancelled")))
    .orderBy(asc(memorialServices.startAt));
  const targets =
    services.length > 0
      ? await conn
          .select()
          .from(memorialServiceTargets)
          .where(inArray(memorialServiceTargets.memorialServiceId, services.map((s) => s.id)))
      : [];
  const held = new Set(targets.map((t) => `${t.personId}:${t.kaiki}`));

  const upcomingServices = services.filter((s) => s.status === "scheduled" && s.startAt >= jst(today));
  const people = await personsByIds(targets.map((t) => t.personId), conn);
  const staffMap = await staffByIds(upcomingServices.map((s) => s.officiantStaffId), conn);
  const confirmed = upcomingServices.map((s) => ({
    id: s.id,
    startAt: s.startAt,
    location: s.location as MemorialLocation,
    officiantName: staffLabel(staffMap.get(s.officiantStaffId)),
    targets: targets
      .filter((t) => t.memorialServiceId === s.id)
      .flatMap((t) => {
        const p = people.get(t.personId);
        return p ? [{ personId: p.id, name: fullName(p), kaiki: t.kaiki, kaikiName: kaikiName(t.kaiki) }] : [];
      }),
  }));

  let upcoming: HouseholdMemorialSchedule["upcoming"] = [];
  if (deceased.length > 0) {
    const preset = (await getTemple(deceased[0].templeId, conn)).preset;
    upcoming = deceased
      .flatMap((p) =>
        p.deathDate
          ? memorialsBetweenYears(p.deathDate, thisYear, thisYear + years, preset)
              .filter((m) => m.meinichi >= today && m.meinichi < until && !held.has(`${p.id}:${m.kaiki}`))
              .map((m) => ({
                personId: p.id,
                name: fullName(p),
                homyo: p.homyo,
                relation: p.relation,
                year: m.year,
                kaiki: m.kaiki,
                kaikiName: m.kaikiName,
                meinichi: m.meinichi,
              }))
          : [],
      )
      .sort((a, b) => a.meinichi.localeCompare(b.meinichi) || a.name.localeCompare(b.name));
  }
  return { confirmed, upcoming };
}

/**
 * 申し込みフォームで回忌を提案する（故人と希望の年から）。
 * その年が年忌（宗派プリセットの一覧）でなければ isMemorialKaiki = false。没年より前の年は invalid
 */
export async function suggestKaiki(
  personId: string,
  year: number,
  conn: DbOrTx = db,
): Promise<{ kaiki: number; kaikiName: string; isMemorialKaiki: boolean }> {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw invalid(`年が正しくありません: ${year}`);
  const [p] = isUuid(personId) ? await conn.select().from(persons).where(eq(persons.id, personId)) : [];
  if (!p) throw notFound("故人が見つかりません");
  if (!p.isDeceased || !p.deathDate) throw invalid(`${fullName(p)}さんは故人として登録されていません`);
  const kaiki = kaikiOfYear(p.deathDate, year);
  if (kaiki < 1) throw invalid(`${year} 年は、${fullName(p)}さんが亡くなる前の年です（没年 ${p.deathDate.slice(0, 4)} 年）`);
  const preset = (await getTemple(p.templeId, conn)).preset;
  return { kaiki, kaikiName: kaikiName(kaiki, preset), isMemorialKaiki: isMemorialKaiki(kaiki, preset) };
}
