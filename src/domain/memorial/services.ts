// 法要（memorial_services）: 確定（book_memorial_service）、取り消し、一覧、詳細（spec.md §3）
//
// 確定は 1 つのトランザクションで行う:
//   空きの確かめ直し → memorial_services と memorial_service_targets → 担当者の業務の予定（02 createSharedEvent）
//   → お寺なら本堂の予約（03 createReservation、confirmed）→ 申し込みを scheduled にする（なければ source = phone で作る）
// プレビュー（MCP）と確定は、同じ planMemorialBooking で内容を組み立てる。
import { and, asc, desc, eq, gte, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { memorialRequests, memorialServices, memorialServiceTargets } from "@/db/schema";
import { cancelEventsByMemorialService, createSharedEvent, getCalendar, getStaffBusyIntervals } from "@/domain/calendar";
import {
  conflict,
  forbidden,
  formatJst,
  getTemple,
  invalid,
  jstDateString,
  jstTimeString,
  notFound,
  overlaps,
  type Actor,
  type Interval,
} from "@/domain/core";
import {
  cancelReservationsByMemorialService,
  createReservation,
  getFacility,
  getFacilityBusyIntervals,
  getMainHallId,
  listReservations,
  type Reservation,
} from "@/domain/facility";
import {
  assertStaff,
  checkTargets,
  fullName,
  householdsByIds,
  isUuid,
  optText,
  personsByIds,
  requireHousehold,
  staffByIds,
  staffLabel,
  targetsSummary,
  targetView,
  type TargetInput,
} from "./common";
import { assertRequestIsOpen, lockMemorialRequest, resolveSeshu } from "./requests";
import { checkDuration, checkTravel, holdInterval, resolveOfficiants } from "./slots";
import {
  JOINT_SERVICE_LABEL,
  LOCATION_LABELS,
  isMemorialLocation,
  type MemorialLocation,
  type MemorialServiceStatus,
  type TargetView,
} from "./types";
import { bookingWarnings } from "./verify";

export type BookMemorialServiceInput = {
  /** ポータルなどで受けた申し込みを確定するとき */
  memorialRequestId?: string | null;
  /** 申し込みがないとき（電話で受けて、その場で確定する）は必須 */
  householdId?: string | null;
  /** 故人ごとの回忌。申し込みを指定したときは省略でき、申し込みの内容を使う */
  targets?: TargetInput[] | null;
  /** 施主（どちらか 1 つ）。省略すると、申し込みの施主か、世帯の窓口 */
  seshuPersonId?: string | null;
  seshuName?: string | null;
  /** 省略すると申し込みの場所。申し込みがなければお寺 */
  location?: MemorialLocation | null;
  /** 法要の始まり */
  start: Date;
  /** 法要の担当者（is_officiant のスタッフ） */
  officiantStaffId: string;
  /** 法要の長さ（分）。省略するとお寺の設定（初期値 40 分） */
  durationMin?: number | null;
  /** 自宅・墓前のときの、行きと帰りの移動時間（分）。自宅・墓前では必須 */
  travelBeforeMin?: number | null;
  travelAfterMin?: number | null;
  notes?: string | null;
  /** 電話の申し込みを自動で作るときに記録する（参列の人数、お斎の有無） */
  attendees?: number | null;
  otoki?: boolean | null;
};

export type MemorialBookingPlan = {
  household: { id: string; name: string; address: string | null; status: string };
  request: {
    id: string;
    source: string;
    createdAt: Date;
    requestedByName: string | null;
  } | null;
  /** existing: 申し込みを確定にする / phone: 電話の受付として申し込みを作る */
  requestAction: "existing" | "phone";
  targets: TargetView[];
  /** 複数霊位供養か（故人が 2 人以上） */
  joint: boolean;
  seshu: { seshuPersonId: string | null; seshuName: string | null; display: string | null };
  location: MemorialLocation;
  start: Date;
  end: Date;
  durationMin: number;
  bufferMin: number;
  travelBeforeMin: number | null;
  travelAfterMin: number | null;
  /** 担当者の予定と本堂の予約で押さえる時間 */
  hold: Interval;
  officiant: { id: string; name: string; roleTitle: string };
  hall: { id: string; name: string } | null;
  notes: string | null;
  attendees: number | null;
  otoki: boolean | null;
  /** 業務の予定と本堂の予約の件名 */
  title: string;
  /** 業務の予定の内容 */
  eventBody: string;
  /** 住職に伝える注意（回忌の食い違い、命日より後の日、離檀の世帯） */
  warnings: string[];
};

/** "2027-03-15（月）10:00〜10:40" */
export function formatServiceRange(start: Date, end: Date): string {
  return `${formatJst(start)}〜${jstTimeString(end)}`;
}

function serviceTitle(householdName: string, targets: { kaikiName: string }[]): string {
  const kaiki = [...new Set(targets.map((t) => t.kaikiName))].join("・");
  return `${householdName} ${kaiki}${targets.length > 1 ? `（${JOINT_SERVICE_LABEL}）` : ""}`;
}

/**
 * 確定の内容を組み立てる（何も書き込まない）。MCP のプレビューと bookMemorialService の確かめ直しの両方で使う。
 * 担当者や本堂が空いていなければ conflict、入力が足りなければ invalid を投げる
 */
export async function planMemorialBooking(
  actor: Actor,
  input: BookMemorialServiceInput,
  conn: DbOrTx = db,
  opts: { now?: Date; lock?: boolean } = {},
): Promise<MemorialBookingPlan> {
  assertStaff(actor);
  const now = opts.now ?? new Date();
  const temple = await getTemple(actor.templeId, conn);
  const settings = temple.settings;

  // ---- 申し込み ----
  let request: MemorialBookingPlan["request"] = null;
  let reqRow: Awaited<ReturnType<typeof lockMemorialRequest>> | null = null;
  if (input.memorialRequestId) {
    reqRow = opts.lock
      ? await lockMemorialRequest(actor.templeId, input.memorialRequestId, conn)
      : await lockFree(actor.templeId, input.memorialRequestId, conn);
    assertRequestIsOpen(reqRow);
    if (input.householdId && input.householdId !== reqRow.householdId) {
      throw invalid("申し込みの世帯と、指定した世帯が違います");
    }
    const by = reqRow.requestedByPersonId ? (await personsByIds([reqRow.requestedByPersonId], conn)).get(reqRow.requestedByPersonId) : undefined;
    request = { id: reqRow.id, source: reqRow.source, createdAt: reqRow.createdAt, requestedByName: by ? fullName(by) : null };
  }
  const householdId = reqRow?.householdId ?? input.householdId;
  if (!householdId) throw invalid("世帯（household_id）か、申し込み（memorial_request_id）を指定してください");
  const household = await requireHousehold(actor.templeId, householdId, conn);

  // ---- 故人と回忌 ----
  const targetInput = input.targets && input.targets.length > 0 ? input.targets : reqRow?.targets;
  if (!targetInput || targetInput.length === 0) throw invalid("供養する故人と回忌（targets）を指定してください");
  const checked = await checkTargets(actor.templeId, household.id, targetInput, conn);
  const targets = checked.map((t) => targetView(t.person, t.kaiki));

  // ---- 施主 ----
  const seshuGiven = Boolean(input.seshuPersonId || input.seshuName?.trim());
  const seshu = await resolveSeshu(
    actor.templeId,
    household.id,
    seshuGiven ? input : { seshuPersonId: reqRow?.seshuPersonId ?? null, seshuName: reqRow?.seshuName ?? null },
    reqRow ? (reqRow.requestedByPersonId ?? null) : (household.contactPersonId ?? household.headPersonId ?? null),
    conn,
  );

  // ---- 場所、日時、担当者 ----
  const location = input.location ?? (reqRow?.location as MemorialLocation | undefined) ?? "temple";
  if (!isMemorialLocation(location)) throw invalid("場所は temple（お寺）、home（自宅）、grave（墓前）のどれかにしてください");
  if (!(input.start instanceof Date) || Number.isNaN(input.start.getTime())) throw invalid("法要の日時が正しくありません");
  if (input.start.getTime() < now.getTime()) throw invalid("過ぎた日時には法要を登録できません");
  const durationMin = checkDuration(input.durationMin, settings);
  const travelBeforeMin = location === "temple" ? null : checkTravel(input.travelBeforeMin, "行き");
  const travelAfterMin = location === "temple" ? null : checkTravel(input.travelAfterMin, "帰り");
  if (!isUuid(input.officiantStaffId)) throw invalid("法要の担当者を指定してください");
  const [officiant] = await resolveOfficiants(actor.templeId, [input.officiantStaffId], conn);
  const start = input.start;
  const end = new Date(start.getTime() + durationMin * 60_000);
  const hold = holdInterval(location, start, durationMin, settings.bufferMin, travelBeforeMin, travelAfterMin);

  // ---- 同じ年忌の二重の登録 ----
  const dup = await conn
    .select({ id: memorialServices.id, startAt: memorialServices.startAt, personId: memorialServiceTargets.personId, kaiki: memorialServiceTargets.kaiki })
    .from(memorialServiceTargets)
    .innerJoin(memorialServices, eq(memorialServices.id, memorialServiceTargets.memorialServiceId))
    .where(
      and(
        eq(memorialServices.templeId, actor.templeId),
        eq(memorialServices.status, "scheduled"),
        inArray(memorialServiceTargets.personId, targets.map((t) => t.personId)),
      ),
    );
  for (const t of targets) {
    const d = dup.find((x) => x.personId === t.personId && x.kaiki === t.kaiki);
    if (d) throw conflict(`${t.name}さんの${t.kaikiName}は、すでに ${formatJst(d.startAt)} に登録されています`);
  }

  // ---- 空きの確かめ直し ----
  const busy = (await getStaffBusyIntervals([officiant.id], { from: hold.start, to: hold.end }, conn))[officiant.id] ?? [];
  const clash = busy.find((b) => overlaps(b, hold));
  if (clash) {
    throw conflict(
      `${officiant.roleTitle} ${officiant.name}は、${formatServiceRange(hold.start, hold.end)} の間にほかの予定（${jstTimeString(clash.start)}〜${jstTimeString(clash.end)}）が入っています。` +
        "find_memorial_slots（管理画面では候補の日時）で空いている日時を確かめてください",
    );
  }
  let hall: MemorialBookingPlan["hall"] = null;
  if (location === "temple") {
    const hallId = await getMainHallId(actor.templeId, conn);
    const f = await getFacility(actor.templeId, hallId, conn);
    hall = { id: f.id, name: f.name };
    const hb = (await getFacilityBusyIntervals(hallId, { from: hold.start, to: hold.end }, conn)).find((b) => overlaps(b, hold));
    if (hb && !opts.lock) {
      // 確定のとき（lock）は、ここでは止めずに createReservation に確かめさせる（排他制約まで含めて 1 か所で判定する）
      throw conflict(
        `${f.name}は、${formatServiceRange(hold.start, hold.end)} の間に予約（${jstTimeString(hb.start)}〜${jstTimeString(hb.end)}、申請中を含む）が入っています。` +
          "find_memorial_slots（管理画面では候補の日時）で空いている日時を確かめてください",
      );
    }
  }

  const warnings = bookingWarnings(
    targets.map((t) => ({ name: t.name, deathDate: t.deathDate, kaiki: t.kaiki })),
    jstDateString(start),
    temple.preset,
  );
  if (household.status !== "active") warnings.push(`${household.name}は、離檀・転出の世帯です`);

  const title = serviceTitle(household.name, targets);
  const holdNote =
    location === "temple"
      ? `前後の準備と片付け ${settings.bufferMin} 分ずつを含めて押さえています`
      : `移動時間（行き ${travelBeforeMin} 分・帰り ${travelAfterMin} 分）を含めて押さえています`;
  const eventBody = [
    `故人: ${targets.map((t) => `${t.relation ?? ""} ${t.name}（${t.homyo ?? "法号なし"}）${t.kaikiName}`).join(" / ")}`,
    `法要: ${jstTimeString(start)}〜${jstTimeString(end)}（${holdNote}）`,
    `場所: ${LOCATION_LABELS[location]}${location !== "temple" && household.address ? `（${household.address}）` : ""}`,
    seshu.display ? `施主: ${seshu.display}` : null,
    input.notes?.trim() ? `メモ: ${input.notes.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    household: { id: household.id, name: household.name, address: household.address, status: household.status },
    request,
    requestAction: request ? "existing" : "phone",
    targets,
    joint: targets.length > 1,
    seshu,
    location,
    start,
    end,
    durationMin,
    bufferMin: settings.bufferMin,
    travelBeforeMin,
    travelAfterMin,
    hold,
    officiant: { id: officiant.id, name: officiant.name, roleTitle: officiant.roleTitle },
    hall,
    notes: optText(input.notes, "メモ", 2000),
    attendees: reqRow ? reqRow.attendees : (input.attendees ?? null),
    otoki: reqRow ? reqRow.otoki : (input.otoki ?? null),
    title,
    eventBody,
    warnings,
  };
}

async function lockFree(templeId: string, id: string, conn: DbOrTx) {
  if (!isUuid(id)) throw notFound("申し込みが見つかりません");
  const [row] = await conn
    .select()
    .from(memorialRequests)
    .where(and(eq(memorialRequests.id, id), eq(memorialRequests.templeId, templeId)));
  if (!row) throw notFound("申し込みが見つかりません");
  return row;
}

export type BookMemorialServiceResult = {
  serviceId: string;
  requestId: string;
  staffEventId: string;
  reservation: Reservation | null;
  plan: MemorialBookingPlan;
};

/** テストのための差し込み口（途中で失敗したときに何も残らないことを確かめる） */
export type BookingHooks = { beforeRequestWrite?: () => Promise<void> | void };

/**
 * 法要を確定する。法要、担当者の予定、本堂の予約（お寺のとき）、申し込みを 1 つのトランザクションで登録する。
 * conn にトランザクションを渡すと、その中のセーブポイントで行う。操作者は staffId を持つスタッフ（03 の確定の予約のため）
 */
export async function bookMemorialService(
  actor: Actor,
  input: BookMemorialServiceInput,
  conn: DbOrTx = db,
  opts: { now?: Date; hooks?: BookingHooks } = {},
): Promise<BookMemorialServiceResult> {
  assertStaff(actor);
  return conn.transaction(async (tx) => {
    // 担当者の予定には排他制約がないので、同じお寺の確定を 1 つずつ行う
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`memorial_booking:${actor.templeId}`}))`);
    const plan = await planMemorialBooking(actor, input, tx, { now: opts.now, lock: true });

    const [service] = await tx
      .insert(memorialServices)
      .values({
        templeId: actor.templeId,
        householdId: plan.household.id,
        seshuPersonId: plan.seshu.seshuPersonId,
        seshuName: plan.seshu.seshuName,
        location: plan.location,
        startAt: plan.start,
        durationMin: plan.durationMin,
        travelBeforeMin: plan.travelBeforeMin,
        travelAfterMin: plan.travelAfterMin,
        officiantStaffId: plan.officiant.id,
        status: "scheduled",
        notes: plan.notes,
      })
      .returning({ id: memorialServices.id });
    await tx.insert(memorialServiceTargets).values(
      plan.targets.map((t) => ({ templeId: actor.templeId, memorialServiceId: service.id, personId: t.personId, kaiki: t.kaiki })),
    );

    const staffEventId = await createSharedEvent(actor, tx, {
      category: "法要",
      title: plan.title,
      body: plan.eventBody,
      start: plan.hold.start,
      end: plan.hold.end,
      assigneeStaffIds: [plan.officiant.id],
      memorialServiceId: service.id,
    });

    let reservation: Reservation | null = null;
    if (plan.hall) {
      reservation = await createReservation(actor, tx, {
        facilityId: plan.hall.id,
        kind: "memorial",
        status: "confirmed",
        start: plan.hold.start,
        end: plan.hold.end,
        householdId: plan.household.id,
        memorialServiceId: service.id,
        title: plan.title,
        notes: `${targetsSummary(plan.targets)}。法要 ${jstTimeString(plan.start)}〜${jstTimeString(plan.end)}（前後の準備と片付けを含む）`,
      });
    }

    await opts.hooks?.beforeRequestWrite?.();

    let requestId: string;
    if (plan.request) {
      await tx
        .update(memorialRequests)
        .set({ status: "scheduled", memorialServiceId: service.id })
        .where(eq(memorialRequests.id, plan.request.id));
      requestId = plan.request.id;
    } else {
      const [row] = await tx
        .insert(memorialRequests)
        .values({
          templeId: actor.templeId,
          householdId: plan.household.id,
          source: "phone",
          staffId: actor.staffId,
          seshuPersonId: plan.seshu.seshuPersonId,
          seshuName: plan.seshu.seshuName,
          targets: plan.targets.map((t) => ({ personId: t.personId, kaiki: t.kaiki })),
          preferredPeriods: [],
          location: plan.location,
          attendees: plan.attendees,
          otoki: plan.otoki,
          notes: plan.notes,
          status: "scheduled",
          memorialServiceId: service.id,
        })
        .returning({ id: memorialRequests.id });
      requestId = row.id;
    }

    return { serviceId: service.id, requestId, staffEventId, reservation, plan };
  });
}

/**
 * 法要を取り消す（cancelled）。ひもづく担当者の予定と本堂の予約も取り消し、申し込みは受付済み（requested）に戻す。
 * 管理画面からだけ行う（MCP では取り消さない。spec.md §4）
 */
export async function cancelMemorialService(
  actor: Actor,
  id: string,
  conn: DbOrTx = db,
): Promise<{ cancelledEvents: number; cancelledReservations: number; reopenedRequests: number }> {
  assertStaff(actor);
  if (actor.channel === "mcp") throw forbidden("法要の取り消しは、管理画面から行ってください");
  if (!isUuid(id)) throw notFound("法要が見つかりません");
  return conn.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(memorialServices)
      .where(and(eq(memorialServices.id, id), eq(memorialServices.templeId, actor.templeId)))
      .for("update");
    if (!row) throw notFound("法要が見つかりません");
    if (row.status === "cancelled") throw conflict("この法要は、すでに取り消しています");
    if (row.status === "done") throw conflict("済んだ法要は取り消せません");
    await tx.update(memorialServices).set({ status: "cancelled" }).where(eq(memorialServices.id, id));
    const cancelledEvents = await cancelEventsByMemorialService(actor, tx, id);
    const cancelledReservations = await cancelReservationsByMemorialService(actor, tx, id);
    const reopened = await tx
      .update(memorialRequests)
      .set({ status: "requested", memorialServiceId: null })
      .where(and(eq(memorialRequests.memorialServiceId, id), eq(memorialRequests.status, "scheduled")))
      .returning({ id: memorialRequests.id });
    return { cancelledEvents, cancelledReservations, reopenedRequests: reopened.length };
  });
}

// ---- 読み取り ----

export type MemorialServiceSummary = {
  id: string;
  householdId: string;
  householdName: string;
  location: MemorialLocation;
  startAt: Date;
  endAt: Date;
  durationMin: number;
  status: MemorialServiceStatus;
  officiant: { id: string; name: string; roleTitle: string; label: string };
  targets: TargetView[];
  joint: boolean;
  title: string;
};

export type ListMemorialServicesOptions = {
  from?: Date;
  to?: Date;
  officiantStaffId?: string;
  location?: MemorialLocation;
  householdId?: string;
  /** 省略すると取り消し以外 */
  statuses?: MemorialServiceStatus[];
  /** 新しい順にする（初期値は日時の順） */
  descending?: boolean;
  limit?: number;
};

type ServiceRow = typeof memorialServices.$inferSelect;

async function toSummaries(rows: ServiceRow[], conn: DbOrTx): Promise<MemorialServiceSummary[]> {
  if (rows.length === 0) return [];
  const targets = await conn
    .select()
    .from(memorialServiceTargets)
    .where(inArray(memorialServiceTargets.memorialServiceId, rows.map((r) => r.id)));
  const people = await personsByIds(targets.map((t) => t.personId), conn);
  const hh = await householdsByIds(rows.map((r) => r.householdId), conn);
  const staffMap = await staffByIds(rows.map((r) => r.officiantStaffId), conn);
  return rows.map((r) => {
    const ts = targets
      .filter((t) => t.memorialServiceId === r.id)
      .flatMap((t) => {
        const p = people.get(t.personId);
        return p ? [targetView(p, t.kaiki)] : [];
      })
      .sort((a, b) => (a.deathDate ?? "").localeCompare(b.deathDate ?? "") * -1);
    const s = staffMap.get(r.officiantStaffId);
    const householdName = hh.get(r.householdId)?.name ?? "（不明な世帯）";
    return {
      id: r.id,
      householdId: r.householdId,
      householdName,
      location: r.location as MemorialLocation,
      startAt: r.startAt,
      endAt: new Date(r.startAt.getTime() + r.durationMin * 60_000),
      durationMin: r.durationMin,
      status: r.status as MemorialServiceStatus,
      officiant: { id: r.officiantStaffId, name: s?.name ?? "", roleTitle: s?.roleTitle ?? "", label: staffLabel(s) },
      targets: ts,
      joint: ts.length > 1,
      title: serviceTitle(householdName, ts),
    };
  });
}

/** 法要の一覧（スタッフ用）。日時の順 */
export async function listMemorialServices(
  actor: Actor,
  opts: ListMemorialServicesOptions = {},
  conn: DbOrTx = db,
): Promise<MemorialServiceSummary[]> {
  assertStaff(actor);
  const conds: SQL[] = [eq(memorialServices.templeId, actor.templeId)];
  if (opts.statuses && opts.statuses.length > 0) conds.push(inArray(memorialServices.status, opts.statuses));
  else conds.push(ne(memorialServices.status, "cancelled"));
  if (opts.from) conds.push(gte(memorialServices.startAt, opts.from));
  if (opts.to) conds.push(lt(memorialServices.startAt, opts.to));
  if (opts.officiantStaffId && isUuid(opts.officiantStaffId)) conds.push(eq(memorialServices.officiantStaffId, opts.officiantStaffId));
  if (opts.location) conds.push(eq(memorialServices.location, opts.location));
  if (opts.householdId && isUuid(opts.householdId)) conds.push(eq(memorialServices.householdId, opts.householdId));
  const rows = await conn
    .select()
    .from(memorialServices)
    .where(and(...conds))
    .orderBy(opts.descending ? desc(memorialServices.startAt) : asc(memorialServices.startAt))
    .limit(opts.limit ?? 300);
  return toSummaries(rows, conn);
}

export type MemorialServiceDetail = MemorialServiceSummary & {
  household: { id: string; name: string; address: string | null; phone: string | null };
  seshuDisplay: string | null;
  travelBeforeMin: number | null;
  travelAfterMin: number | null;
  hold: Interval;
  notes: string | null;
  createdAt: Date;
  request: { id: string; source: string; status: string; createdAt: Date; requestedByName: string | null; staffName: string | null } | null;
  /** ひもづく担当者の予定（取り消したものは出ない） */
  staffEvents: { id: string; title: string; start: Date; end: Date }[];
  /** ひもづく本堂の予約（取り消したものを含む） */
  reservations: { id: string; facilityName: string; status: string; start: Date; end: Date; requestCode: string | null }[];
};

/** 法要の詳細（スタッフ用）。なければ notFound */
export async function getMemorialService(actor: Actor, id: string, conn: DbOrTx = db): Promise<MemorialServiceDetail> {
  assertStaff(actor);
  if (!isUuid(id)) throw notFound("法要が見つかりません");
  const [row] = await conn
    .select()
    .from(memorialServices)
    .where(and(eq(memorialServices.id, id), eq(memorialServices.templeId, actor.templeId)));
  if (!row) throw notFound("法要が見つかりません");
  const [summary] = await toSummaries([row], conn);
  const temple = await getTemple(actor.templeId, conn);
  const location = row.location as MemorialLocation;
  const hold = holdInterval(location, row.startAt, row.durationMin, temple.settings.bufferMin, row.travelBeforeMin, row.travelAfterMin);
  const h = (await householdsByIds([row.householdId], conn)).get(row.householdId);
  const seshuP = row.seshuPersonId ? (await personsByIds([row.seshuPersonId], conn)).get(row.seshuPersonId) : undefined;

  const [req] = await conn.select().from(memorialRequests).where(eq(memorialRequests.memorialServiceId, id)).limit(1);
  let request: MemorialServiceDetail["request"] = null;
  if (req) {
    const by = req.requestedByPersonId ? (await personsByIds([req.requestedByPersonId], conn)).get(req.requestedByPersonId) : undefined;
    const st = req.staffId ? (await staffByIds([req.staffId], conn)).get(req.staffId) : undefined;
    request = {
      id: req.id,
      source: req.source,
      status: req.status,
      createdAt: req.createdAt,
      requestedByName: by ? fullName(by) : null,
      staffName: st ? staffLabel(st) : null,
    };
  }

  // ひもづく予定と予約は、持ち主（02、03）の読み取りの関数から取る
  const range = { from: new Date(hold.start.getTime() - 60_000), to: new Date(hold.end.getTime() + 60_000) };
  const cal = await getCalendar(actor, { ...range, staffIds: [row.officiantStaffId] }, conn);
  const staffEvents = cal.events.flatMap((e) =>
    e.kind === "detail" && e.memorialServiceId === id ? [{ id: e.id, title: e.title, start: e.start, end: e.end }] : [],
  );
  const reservations =
    location === "temple"
      ? (await listReservations(actor.templeId, range, conn))
          .filter((r) => r.memorialServiceId === id)
          .map((r) => ({ id: r.id, facilityName: r.facilityName, status: r.status, start: r.start, end: r.end, requestCode: r.requestCode }))
      : [];

  return {
    ...summary,
    household: { id: row.householdId, name: h?.name ?? "（不明な世帯）", address: h?.address ?? null, phone: h?.phone ?? null },
    seshuDisplay: seshuP ? fullName(seshuP) : row.seshuName,
    travelBeforeMin: row.travelBeforeMin,
    travelAfterMin: row.travelAfterMin,
    hold,
    notes: row.notes,
    createdAt: row.createdAt,
    request,
    staffEvents,
    reservations,
  };
}
