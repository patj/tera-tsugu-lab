// 【仮の実装】統合時に `@/domain/memorial` の関数に置き換える。
// 法要の受付（04）は別の worktree で並列に作っている。04 が `@/domain/memorial` から export すると約束した関数と
// 同じ名前・同じ形の仮の関数を置く。ポータルからは必ずこのファイルを通して呼ぶ。
// 置き換えるときは、4 つの関数（createMemorialRequest、listMemorialRequestsForHousehold、getHouseholdMemorialSchedule、
// suggestKaiki）だけを `export { createMemorialRequest, … } from "@/domain/memorial";` に差し替え、このファイルの型
// （HouseholdMemorialRequest など。index.ts が再 export している）は残す（04 が同じ型の名前を export するとは限らないため）。
// そうすれば、ポータルのほかのファイルは変えなくてよい。
//
// 仮の実装の前提（テストと画面が動く程度の最小限）:
// - memorial_requests、memorial_services、memorial_service_targets を直接読み書きする（本来の持ち主は 04）
// - createMemorialRequest は、家族の can_apply_memorial の判定や入力の細かい検証をしない（06 が呼ぶ前に行う）。
//   監査ログ（memorial.request.create）は 04 が書く想定で、ここでも書く
// - 確定した法要は、memorial_services の status = "scheduled" のもの。「確定済みの年忌」は、取り消し（cancelled）以外の
//   法要の対象（memorial_service_targets）にある（故人、回忌）の組
// - 約束した形に合わせ、呼ぶ側は conn を渡さない（仮の実装では、テストのために省略できる引数として残す）
// - 年忌の計算は @/domain/ledger の関数（kaikiOfYear、kaikiName、isMemorialKaiki、memorialsBetweenYears）を使う
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import {
  memorialRequests,
  memorialServices,
  memorialServiceTargets,
  persons,
  staff,
  type MemorialRequestTarget,
  type PreferredPeriod,
} from "@/db/schema";
import { getTemple, invalid, jst, notFound, todayJst, writeAuditLog, type Actor } from "@/domain/core";
import { isMemorialKaiki, kaikiName, kaikiOfYear, memorialsBetweenYears } from "@/domain/ledger";

export type MemorialLocation = "temple" | "home" | "grave";
export type MemorialRequestStatus = "requested" | "scheduled" | "declined";

export type CreateMemorialRequestInput = {
  householdId: string;
  /** 1 人以上。複数なら複数霊位供養 */
  targets: { personId: string; kaiki: number }[];
  /** どちらか 1 つ */
  seshuPersonId?: string | null;
  seshuName?: string | null;
  /** "YYYY-MM-DD"。1〜3 件 */
  preferredPeriods: { from: string; to: string; note?: string }[];
  location: MemorialLocation;
  attendees?: number | null;
  otoki?: boolean | null;
  notes?: string | null;
};

export type MemorialTargetView = { personId: string; name: string; kaiki: number; kaikiName: string };

export type MemorialServiceView = {
  id: string;
  startAt: Date;
  location: MemorialLocation;
  officiantName: string;
};

export type HouseholdMemorialRequest = {
  id: string;
  source: "portal" | "phone";
  status: MemorialRequestStatus;
  createdAt: Date;
  requestedByPersonId: string | null;
  requestedByName: string | null;
  targets: MemorialTargetView[];
  preferredPeriods: { from: string; to: string; note?: string }[];
  location: MemorialLocation;
  declineReason: string | null;
  service: MemorialServiceView | null;
};

export type HouseholdMemorialSchedule = {
  confirmed: (MemorialServiceView & { targets: MemorialTargetView[] })[];
  upcoming: {
    personId: string;
    name: string;
    homyo: string | null;
    relation: string | null;
    year: number;
    kaiki: number;
    kaikiName: string;
    meinichi: string;
  }[];
};

/** 申し込みを作る（ポータルから）。source = "portal"、status = "requested"。requested_by_person_id = actor.personId */
export async function createMemorialRequest(
  actor: Actor,
  input: CreateMemorialRequestInput,
  conn: DbOrTx = db,
): Promise<{ id: string }> {
  if (input.targets.length === 0) throw invalid("故人を 1 人以上選んでください");
  if (input.preferredPeriods.length < 1 || input.preferredPeriods.length > 3) {
    throw invalid("希望の時期は 1〜3 件で指定してください");
  }
  if (Boolean(input.seshuPersonId) === Boolean(input.seshuName)) throw invalid("施主は 1 人だけ指定してください");
  const targets: MemorialRequestTarget[] = input.targets.map((t) => ({ personId: t.personId, kaiki: t.kaiki }));
  const periods: PreferredPeriod[] = input.preferredPeriods.map((p) =>
    p.note ? { from: p.from, to: p.to, note: p.note } : { from: p.from, to: p.to },
  );
  const [row] = await conn
    .insert(memorialRequests)
    .values({
      templeId: actor.templeId,
      householdId: input.householdId,
      source: "portal",
      requestedByPersonId: actor.personId ?? null,
      seshuPersonId: input.seshuPersonId ?? null,
      seshuName: input.seshuName ?? null,
      targets,
      preferredPeriods: periods,
      location: input.location,
      attendees: input.attendees ?? null,
      otoki: input.otoki ?? null,
      notes: input.notes ?? null,
      status: "requested",
    })
    .returning({ id: memorialRequests.id });
  await writeAuditLog(
    actor,
    { action: "memorial.request.create", target: `memorial_request:${row.id}`, summary: `ポータルからの法要の申し込み（${targets.length} 人）`, result: "ok" },
    conn,
  );
  return { id: row.id };
}

async function personNames(ids: string[], conn: DbOrTx): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return out;
  const rows = await conn
    .select({ id: persons.id, familyName: persons.familyName, givenName: persons.givenName })
    .from(persons)
    .where(inArray(persons.id, uniq));
  for (const r of rows) out.set(r.id, `${r.familyName} ${r.givenName}`);
  return out;
}

function toTargetViews(targets: { personId: string; kaiki: number }[], names: Map<string, string>): MemorialTargetView[] {
  return targets.map((t) => ({
    personId: t.personId,
    name: names.get(t.personId) ?? "（不明）",
    kaiki: t.kaiki,
    kaikiName: t.kaiki >= 1 ? kaikiName(t.kaiki) : `${t.kaiki}`,
  }));
}

async function loadServices(ids: string[], conn: DbOrTx) {
  if (ids.length === 0) return new Map<string, MemorialServiceView>();
  const rows = await conn
    .select({
      id: memorialServices.id,
      startAt: memorialServices.startAt,
      location: memorialServices.location,
      officiantName: staff.name,
    })
    .from(memorialServices)
    .innerJoin(staff, eq(staff.id, memorialServices.officiantStaffId))
    .where(inArray(memorialServices.id, ids));
  return new Map(
    rows.map((r) => [r.id, { id: r.id, startAt: r.startAt, location: r.location as MemorialLocation, officiantName: r.officiantName }]),
  );
}

/** 世帯の法要の申し込み（新しい順）。状態（受付済み / 確定 / お断りと理由）と、確定した法要つき */
export async function listMemorialRequestsForHousehold(
  householdId: string,
  conn: DbOrTx = db,
): Promise<HouseholdMemorialRequest[]> {
  const rows = await conn
    .select()
    .from(memorialRequests)
    .where(eq(memorialRequests.householdId, householdId))
    .orderBy(desc(memorialRequests.createdAt));
  const names = await personNames(
    rows.flatMap((r) => [...r.targets.map((t) => t.personId), ...(r.requestedByPersonId ? [r.requestedByPersonId] : [])]),
    conn,
  );
  const services = await loadServices(
    rows.map((r) => r.memorialServiceId).filter((x): x is string => !!x),
    conn,
  );
  return rows.map((r) => ({
    id: r.id,
    source: r.source as "portal" | "phone",
    status: r.status as MemorialRequestStatus,
    createdAt: r.createdAt,
    requestedByPersonId: r.requestedByPersonId,
    requestedByName: r.requestedByPersonId ? (names.get(r.requestedByPersonId) ?? null) : null,
    targets: toTargetViews(r.targets, names),
    preferredPeriods: r.preferredPeriods,
    location: r.location as MemorialLocation,
    declineReason: r.declineReason,
    service: r.memorialServiceId ? (services.get(r.memorialServiceId) ?? null) : null,
  }));
}

/**
 * 世帯の法要の予定。confirmed は確定の法要で今日以降、upcoming は今後の年忌の目安（確定済みの年忌は除く）。
 * upcoming は、今年から years 年分（初期値 3 年）のうち、祥月命日が今日以降のもの
 */
export async function getHouseholdMemorialSchedule(
  householdId: string,
  opts: { today?: string; years?: number } = {},
  conn: DbOrTx = db,
): Promise<HouseholdMemorialSchedule> {
  const today = opts.today ?? todayJst();
  const years = opts.years ?? 3;
  const thisYear = Number(today.slice(0, 4));

  const services = await conn
    .select({
      id: memorialServices.id,
      templeId: memorialServices.templeId,
      startAt: memorialServices.startAt,
      location: memorialServices.location,
      status: memorialServices.status,
      officiantName: staff.name,
    })
    .from(memorialServices)
    .innerJoin(staff, eq(staff.id, memorialServices.officiantStaffId))
    .where(and(eq(memorialServices.householdId, householdId), ne(memorialServices.status, "cancelled")))
    .orderBy(asc(memorialServices.startAt));
  const serviceIds = services.map((s) => s.id);
  const targetRows = serviceIds.length
    ? await conn.select().from(memorialServiceTargets).where(inArray(memorialServiceTargets.memorialServiceId, serviceIds))
    : [];
  const names = await personNames(targetRows.map((t) => t.personId), conn);
  const booked = new Set(targetRows.map((t) => `${t.personId}:${t.kaiki}`));

  const todayStart = jst(today);
  const confirmed = services
    .filter((s) => s.status === "scheduled" && s.startAt >= todayStart)
    .map((s) => ({
      id: s.id,
      startAt: s.startAt,
      location: s.location as MemorialLocation,
      officiantName: s.officiantName,
      targets: toTargetViews(
        targetRows.filter((t) => t.memorialServiceId === s.id),
        names,
      ),
    }));

  const deceased = await conn
    .select()
    .from(persons)
    .where(and(eq(persons.householdId, householdId), eq(persons.isDeceased, true)));
  const preset = deceased[0] ? (await getTemple(deceased[0].templeId, conn)).preset : null;
  const upcoming: HouseholdMemorialSchedule["upcoming"] = [];
  if (preset) {
    for (const p of deceased) {
      if (!p.deathDate) continue;
      for (const m of memorialsBetweenYears(p.deathDate, thisYear, thisYear + years - 1, preset)) {
        if (m.meinichi < today || booked.has(`${p.id}:${m.kaiki}`)) continue;
        upcoming.push({
          personId: p.id,
          name: `${p.familyName} ${p.givenName}`,
          homyo: p.homyo,
          relation: p.relation,
          year: m.year,
          kaiki: m.kaiki,
          kaikiName: m.kaikiName,
          meinichi: m.meinichi,
        });
      }
    }
  }
  upcoming.sort((a, b) => a.meinichi.localeCompare(b.meinichi));
  return { confirmed, upcoming };
}

/** 選んだ故人と年から回忌を提案する（申し込みフォームの初期値） */
export async function suggestKaiki(
  personId: string,
  year: number,
  conn: DbOrTx = db,
): Promise<{ kaiki: number; kaikiName: string; isMemorialKaiki: boolean }> {
  const [p] = await conn.select().from(persons).where(eq(persons.id, personId));
  if (!p || !p.isDeceased || !p.deathDate) throw notFound("故人が見つかりません");
  const kaiki = kaikiOfYear(p.deathDate, year);
  if (kaiki < 1) throw invalid("亡くなった年より前の年は選べません");
  const preset = (await getTemple(p.templeId, conn)).preset;
  return { kaiki, kaikiName: kaikiName(kaiki, preset), isMemorialKaiki: isMemorialKaiki(kaiki, preset) };
}
