// 法要の申し込み（memorial_requests）: ポータルからの受付、一覧、お断り（spec.md §3.1）
// 状態: requested（受付済み）→ scheduled（確定。book で法要とひもづく）/ declined（お断り。理由が必須）
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { memorialRequests, memorialServices, type PreferredPeriod } from "@/db/schema";
import { addDays, conflict, forbidden, invalid, notFound, todayJst, writeAuditLog, type Actor } from "@/domain/core";
import {
  assertStaff,
  checkDate,
  checkTargets,
  fullName,
  householdsByIds,
  isUuid,
  optText,
  personsByIds,
  requireHousehold,
  requirePerson,
  staffByIds,
  staffLabel,
  targetView,
  type TargetInput,
} from "./common";
import {
  MAX_PREFERRED_PERIODS,
  isMemorialLocation,
  type MemorialLocation,
  type MemorialRequestSource,
  type MemorialRequestStatus,
  type MemorialServiceStatus,
  type TargetView,
} from "./types";

/** 希望の時期は、今日から何年先まで受け付けるか */
const MAX_YEARS_AHEAD = 3;

export type CreateMemorialRequestInput = {
  householdId: string;
  /** 1 人以上。複数なら複数霊位供養 */
  targets: TargetInput[];
  /** 施主（台帳にいる人か、台帳にいない人の名前。どちらか 1 つ。どちらもなければ申し込んだ本人） */
  seshuPersonId?: string | null;
  seshuName?: string | null;
  /** "YYYY-MM-DD"。第 1〜第 3 希望 */
  preferredPeriods: PreferredPeriod[];
  location: MemorialLocation;
  attendees?: number | null;
  otoki?: boolean | null;
  notes?: string | null;
};

/** 希望の時期を検証する（1〜max 件、from ≦ to、今日以降、MAX_YEARS_AHEAD 年先まで） */
export function checkPreferredPeriods(
  periods: PreferredPeriod[],
  today: string,
  opts: { min?: number; max?: number } = {},
): PreferredPeriod[] {
  const min = opts.min ?? 1;
  const max = opts.max ?? MAX_PREFERRED_PERIODS;
  const list = Array.isArray(periods) ? periods : [];
  if (list.length < min) throw invalid("希望の時期を 1 つ以上入力してください");
  if (list.length > max) throw invalid(`希望の時期は ${max} つまでにしてください`);
  const limit = addDays(today, 366 * MAX_YEARS_AHEAD);
  return list.map((p, i) => {
    const label = `第 ${i + 1} 希望`;
    const from = checkDate(String(p?.from ?? "").trim(), `${label}の始まり`);
    const to = checkDate(String(p?.to ?? "").trim(), `${label}の終わり`);
    if (from > to) throw invalid(`${label}の終わりは、始まりと同じか後の日にしてください`);
    if (to < today) throw invalid(`${label}が過ぎた日になっています`);
    if (from > limit) throw invalid(`${label}は ${MAX_YEARS_AHEAD} 年先までにしてください`);
    const note = optText(p?.note, `${label}の連絡事項`, 200);
    return note ? { from, to, note } : { from, to };
  });
}

function checkAttendees(n: number | null | undefined): number | null {
  if (n === null || n === undefined) return null;
  if (!Number.isInteger(n) || n < 1 || n > 999) throw invalid("参列の人数は 1〜999 の整数で入力してください");
  return n;
}

/**
 * 施主を決める。seshuPersonId（その世帯の生きている人）か seshuName のどちらか 1 つ。
 * どちらもなければ fallbackPersonId（申し込んだ本人や窓口）にする
 */
export async function resolveSeshu(
  templeId: string,
  householdId: string,
  input: { seshuPersonId?: string | null; seshuName?: string | null },
  fallbackPersonId: string | null,
  conn: DbOrTx = db,
): Promise<{ seshuPersonId: string | null; seshuName: string | null; display: string | null }> {
  const name = optText(input.seshuName, "施主の名前", 60);
  const personId = input.seshuPersonId?.trim() || null;
  if (personId && name) throw invalid("施主は、家族から選ぶか名前を入力するかの、どちらか 1 つにしてください");
  if (name) return { seshuPersonId: null, seshuName: name, display: name };
  const id = personId ?? fallbackPersonId;
  if (!id) return { seshuPersonId: null, seshuName: null, display: null };
  const p = await requirePerson(templeId, id, conn);
  if (p.householdId !== householdId || p.isDeceased) throw invalid("施主は、この世帯の生きている家族から選んでください");
  return { seshuPersonId: p.id, seshuName: null, display: fullName(p) };
}

/**
 * 法要の申し込みを作る（ポータルから）。source = portal、状態 requested。
 * 操作者（portalActor）がその世帯の生きている人であること、targets がその世帯の故人であることを確かめる。
 * 家族の権限（can_apply_memorial）の判定は、呼ぶ前に 06 が行う
 */
export async function createMemorialRequest(
  actor: Actor,
  input: CreateMemorialRequestInput,
  opts: { today?: string } = {},
  conn: DbOrTx = db,
): Promise<{ id: string }> {
  if (!actor.personId) throw forbidden("法要の申し込みは、ポータルからログインして行ってください");
  const household = await requireHousehold(actor.templeId, input.householdId, conn);
  const me = await requirePerson(actor.templeId, actor.personId, conn);
  if (me.householdId !== household.id || me.isDeceased) throw forbidden("ほかの家の法要は申し込めません");

  const targets = await checkTargets(actor.templeId, household.id, input.targets, conn);
  const seshu = await resolveSeshu(actor.templeId, household.id, input, me.id, conn);
  const periods = checkPreferredPeriods(input.preferredPeriods, opts.today ?? todayJst());
  if (!isMemorialLocation(input.location)) throw invalid("場所は、お寺・自宅・墓前から選んでください");

  const [row] = await conn
    .insert(memorialRequests)
    .values({
      templeId: actor.templeId,
      householdId: household.id,
      source: "portal",
      requestedByPersonId: me.id,
      seshuPersonId: seshu.seshuPersonId,
      seshuName: seshu.seshuName,
      targets: targets.map((t) => ({ personId: t.person.id, kaiki: t.kaiki })),
      preferredPeriods: periods,
      location: input.location,
      attendees: checkAttendees(input.attendees),
      otoki: input.otoki ?? null,
      notes: optText(input.notes, "連絡事項", 2000),
      status: "requested",
    })
    .returning({ id: memorialRequests.id });
  await writeAuditLog(actor, { action: "memorial_request.create", target: row.id, summary: household.name, result: "ok" }, conn);
  return row;
}

// ---- 読み取り ----

export type MemorialRequestView = {
  id: string;
  householdId: string;
  householdName: string;
  householdAddress: string | null;
  householdPhone: string | null;
  source: MemorialRequestSource;
  status: MemorialRequestStatus;
  createdAt: Date;
  /** ポータルから申し込んだ人（代理の家族を含む） */
  requestedByPersonId: string | null;
  requestedByName: string | null;
  /** 電話で受けたスタッフ */
  staffId: string | null;
  staffName: string | null;
  seshuPersonId: string | null;
  seshuName: string | null;
  /** 施主の表示名（台帳の人ならその氏名） */
  seshuDisplay: string | null;
  targets: TargetView[];
  preferredPeriods: PreferredPeriod[];
  location: MemorialLocation;
  attendees: number | null;
  otoki: boolean | null;
  notes: string | null;
  declineReason: string | null;
  service: {
    id: string;
    startAt: Date;
    durationMin: number;
    location: MemorialLocation;
    officiantStaffId: string;
    officiantName: string;
    status: MemorialServiceStatus;
  } | null;
};

type RequestRow = typeof memorialRequests.$inferSelect;

async function toViews(rows: RequestRow[], conn: DbOrTx): Promise<MemorialRequestView[]> {
  if (rows.length === 0) return [];
  const personIds = rows.flatMap((r) => [
    ...r.targets.map((t) => t.personId),
    ...(r.requestedByPersonId ? [r.requestedByPersonId] : []),
    ...(r.seshuPersonId ? [r.seshuPersonId] : []),
  ]);
  const people = await personsByIds(personIds, conn);
  const hh = await householdsByIds(rows.map((r) => r.householdId), conn);
  const serviceIds = rows.map((r) => r.memorialServiceId).filter((x): x is string => Boolean(x));
  const services =
    serviceIds.length > 0 ? await conn.select().from(memorialServices).where(inArray(memorialServices.id, serviceIds)) : [];
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const staffMap = await staffByIds(
    [...rows.map((r) => r.staffId), ...services.map((s) => s.officiantStaffId)].filter((x): x is string => Boolean(x)),
    conn,
  );

  return rows.map((r) => {
    const h = hh.get(r.householdId);
    const by = r.requestedByPersonId ? people.get(r.requestedByPersonId) : undefined;
    const seshuP = r.seshuPersonId ? people.get(r.seshuPersonId) : undefined;
    const s = r.memorialServiceId ? serviceById.get(r.memorialServiceId) : undefined;
    return {
      id: r.id,
      householdId: r.householdId,
      householdName: h?.name ?? "（不明な世帯）",
      householdAddress: h?.address ?? null,
      householdPhone: h?.phone ?? null,
      source: r.source as MemorialRequestSource,
      status: r.status as MemorialRequestStatus,
      createdAt: r.createdAt,
      requestedByPersonId: r.requestedByPersonId,
      requestedByName: by ? fullName(by) : null,
      staffId: r.staffId,
      staffName: r.staffId ? staffLabel(staffMap.get(r.staffId)) : null,
      seshuPersonId: r.seshuPersonId,
      seshuName: r.seshuName,
      seshuDisplay: seshuP ? fullName(seshuP) : r.seshuName,
      targets: r.targets.flatMap((t) => {
        const p = people.get(t.personId);
        return p ? [targetView(p, t.kaiki)] : [];
      }),
      preferredPeriods: r.preferredPeriods ?? [],
      location: r.location as MemorialLocation,
      attendees: r.attendees,
      otoki: r.otoki,
      notes: r.notes,
      declineReason: r.declineReason,
      service:
        s && s.status !== "cancelled"
          ? {
              id: s.id,
              startAt: s.startAt,
              durationMin: s.durationMin,
              location: s.location as MemorialLocation,
              officiantStaffId: s.officiantStaffId,
              officiantName: staffLabel(staffMap.get(s.officiantStaffId)),
              status: s.status as MemorialServiceStatus,
            }
          : null,
    };
  });
}

export type HouseholdMemorialRequest = {
  id: string;
  source: MemorialRequestSource;
  status: MemorialRequestStatus;
  createdAt: Date;
  requestedByPersonId: string | null;
  requestedByName: string | null;
  targets: { personId: string; name: string; kaiki: number; kaikiName: string }[];
  preferredPeriods: PreferredPeriod[];
  location: MemorialLocation;
  declineReason: string | null;
  service: { id: string; startAt: Date; location: MemorialLocation; officiantName: string } | null;
};

/** 世帯の申し込みの一覧（新しい順）。06 のポータルが使う。権限の確認は呼ぶ側で行う */
export async function listMemorialRequestsForHousehold(
  householdId: string,
  conn: DbOrTx = db,
): Promise<HouseholdMemorialRequest[]> {
  if (!isUuid(householdId)) return [];
  const rows = await conn
    .select()
    .from(memorialRequests)
    .where(eq(memorialRequests.householdId, householdId))
    .orderBy(desc(memorialRequests.createdAt));
  const views = await toViews(rows, conn);
  return views.map((v) => ({
    id: v.id,
    source: v.source,
    status: v.status,
    createdAt: v.createdAt,
    requestedByPersonId: v.requestedByPersonId,
    requestedByName: v.requestedByName,
    targets: v.targets.map((t) => ({ personId: t.personId, name: t.name, kaiki: t.kaiki, kaikiName: t.kaikiName })),
    preferredPeriods: v.preferredPeriods,
    location: v.location,
    declineReason: v.declineReason,
    service: v.service
      ? { id: v.service.id, startAt: v.service.startAt, location: v.service.location, officiantName: v.service.officiantName }
      : null,
  }));
}

export type ListMemorialRequestsOptions = {
  /** 省略するとすべての状態 */
  statuses?: MemorialRequestStatus[];
  householdId?: string;
  limit?: number;
};

/**
 * 申し込みの一覧（スタッフ用。管理画面、MCP の list_memorial_requests）。
 * 受付済み（requested）を先頭にし、その中は古い順（先に来たものから対応する）。ほかは新しい順
 */
export async function listMemorialRequests(
  actor: Actor,
  opts: ListMemorialRequestsOptions = {},
  conn: DbOrTx = db,
): Promise<MemorialRequestView[]> {
  assertStaff(actor);
  const conds: SQL[] = [eq(memorialRequests.templeId, actor.templeId)];
  if (opts.statuses && opts.statuses.length > 0) conds.push(inArray(memorialRequests.status, opts.statuses));
  if (opts.householdId) {
    if (!isUuid(opts.householdId)) return [];
    conds.push(eq(memorialRequests.householdId, opts.householdId));
  }
  const rows = await conn
    .select()
    .from(memorialRequests)
    .where(and(...conds))
    .orderBy(
      asc(sql`CASE WHEN ${memorialRequests.status} = 'requested' THEN 0 ELSE 1 END`),
      sql`CASE WHEN ${memorialRequests.status} = 'requested' THEN ${memorialRequests.createdAt} END ASC`,
      desc(memorialRequests.createdAt),
    )
    .limit(opts.limit ?? 200);
  return toViews(rows, conn);
}

/** 申し込みを 1 件取る（スタッフ用）。なければ notFound */
export async function getMemorialRequest(actor: Actor, id: string, conn: DbOrTx = db): Promise<MemorialRequestView> {
  assertStaff(actor);
  if (!isUuid(id)) throw notFound("申し込みが見つかりません");
  const [row] = await conn
    .select()
    .from(memorialRequests)
    .where(and(eq(memorialRequests.id, id), eq(memorialRequests.templeId, actor.templeId)));
  if (!row) throw notFound("申し込みが見つかりません");
  return (await toViews([row], conn))[0];
}

/** 申し込みの行をロックして取る（確定・お断りが同時に起きないように） */
export async function lockMemorialRequest(templeId: string, id: string, conn: DbOrTx): Promise<RequestRow> {
  if (!isUuid(id)) throw notFound("申し込みが見つかりません");
  const [row] = await conn
    .select()
    .from(memorialRequests)
    .where(and(eq(memorialRequests.id, id), eq(memorialRequests.templeId, templeId)))
    .for("update");
  if (!row) throw notFound("申し込みが見つかりません");
  return row;
}

/** 受付済み（requested）でなければ conflict */
export function assertRequestIsOpen(row: { status: string }): void {
  if (row.status === "scheduled") throw conflict("この申し込みは、すでに日時が確定しています");
  if (row.status === "declined") throw conflict("この申し込みは、すでにお断りしています");
}

/** 申し込みをお断りする（理由が必須。状態 declined）。ポータルには「お断り」と理由が表示される */
export async function declineMemorialRequest(
  actor: Actor,
  id: string,
  reason: string,
  conn: DbOrTx = db,
): Promise<MemorialRequestView> {
  assertStaff(actor);
  const text = optText(reason, "お断りの理由", 1000);
  if (!text) throw invalid("お断りの理由を入力してください（ポータルで檀家さんに表示されます）");
  return conn.transaction(async (tx) => {
    const row = await lockMemorialRequest(actor.templeId, id, tx);
    assertRequestIsOpen(row);
    await tx
      .update(memorialRequests)
      .set({ status: "declined", declineReason: text })
      .where(eq(memorialRequests.id, row.id));
    return getMemorialRequest(actor, row.id, tx);
  });
}
