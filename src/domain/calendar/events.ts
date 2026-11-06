// スタッフの予定の読み書き（spec.md §3.2）
//
// 私的な予定の内容の保護はここで行う。読み取りはすべて selectEvents を通り、
// 閲覧者が本人でない私的な予定は、SQL の時点でタイトル・内容・カテゴリを読まず、
// toView で「予定あり」と時間だけの形（CalendarEventBusy）にする。
import { and, asc, eq, gt, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { staff, staffEventAssignees, staffEvents } from "@/db/schema";
import { forbidden, invalid, isStaff, listStaff, mergeIntervals, notFound, type Actor, type Interval, type Staff } from "@/domain/core";
import {
  BUSY_LABEL,
  EVENT_CATEGORIES,
  MAX_RANGE_DAYS,
  SHARED_EVENT_CATEGORIES,
  type CalendarEvent,
  type CalendarEventDetail,
  type CalendarStaff,
  type CalendarView,
  type EventAssignee,
  type EventCategory,
  type EventVisibility,
  type SharedEventCategory,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TITLE = 100;
const MAX_BODY = 2000;
/** 1 件の予定の長さの上限（日） */
const MAX_EVENT_DAYS = 14;

// ---- 入力の検証 ----

function checkRange(start: Date, end: Date, maxDays: number, what: string) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime()) || !(end instanceof Date) || Number.isNaN(end.getTime())) {
    throw invalid(`${what}の日時が正しくありません`);
  }
  if (start.getTime() >= end.getTime()) throw invalid(`${what}の終わりは、始まりより後にしてください`);
  if (end.getTime() - start.getTime() > maxDays * DAY_MS) throw invalid(`${what}は ${maxDays} 日以内にしてください`);
}

function cleanTitle(title: string): string {
  const t = (title ?? "").trim();
  if (!t) throw invalid("予定のタイトルを入力してください");
  if (t.length > MAX_TITLE) throw invalid(`タイトルは ${MAX_TITLE} 文字以内にしてください`);
  return t;
}

function cleanBody(body: string | null | undefined): string | null {
  const b = (body ?? "").trim();
  if (b.length > MAX_BODY) throw invalid(`内容は ${MAX_BODY} 文字以内にしてください`);
  return b || null;
}

function checkCategory(category: string, visibility: EventVisibility): EventCategory {
  const allowed: readonly string[] = visibility === "shared" ? SHARED_EVENT_CATEGORIES : EVENT_CATEGORIES;
  if (!allowed.includes(category)) {
    throw invalid(
      visibility === "shared"
        ? `業務の予定のカテゴリは ${SHARED_EVENT_CATEGORIES.join(" / ")} のどれかにしてください`
        : `カテゴリは ${EVENT_CATEGORIES.join(" / ")} のどれかにしてください`,
    );
  }
  return category as EventCategory;
}

/** 担当者を検証する（重複を除き、全員がこのお寺のスタッフであること） */
async function checkAssignees(conn: DbOrTx, templeId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids ?? [])];
  if (unique.length === 0) throw invalid("担当者を 1 人以上選んでください");
  const rows = await conn
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.templeId, templeId), inArray(staff.id, unique)));
  if (rows.length !== unique.length) throw invalid("担当者に、このお寺のスタッフでない人が含まれています");
  return unique;
}

function requireStaff(actor: Actor): asserts actor is Actor & { staffId: string } {
  if (!isStaff(actor)) throw forbidden("スタッフとしてログインしてください");
}

function rejectPortal(actor: Actor) {
  if (actor.channel === "portal" || actor.portalAccountId) throw forbidden("スタッフのカレンダーは、スタッフだけが使えます");
}

// ---- 作成 ----

export type SharedEventInput = {
  category: SharedEventCategory | string;
  title: string;
  body?: string | null;
  start: Date;
  end: Date;
  /** 担当者（1 人以上。ログインしない人も入れられる） */
  assigneeStaffIds: string[];
  /** 法要の予定のとき（04 が法要を確定するときに渡す） */
  memorialServiceId?: string | null;
};

/**
 * 業務の予定を作る。04 が法要を確定するときに、同じトランザクションの中で呼ぶ。
 * 作った人（owner）は操作者。操作者がスタッフでないとき（シードなど）は、最初の担当者にする。
 * @returns 作った予定の ID
 */
export async function createSharedEvent(actor: Actor, tx: DbOrTx, input: SharedEventInput): Promise<string> {
  rejectPortal(actor);
  const category = checkCategory(input.category, "shared");
  const title = cleanTitle(input.title);
  const body = cleanBody(input.body);
  checkRange(input.start, input.end, MAX_EVENT_DAYS, "予定");
  const assignees = await checkAssignees(tx, actor.templeId, input.assigneeStaffIds);

  const [row] = await tx
    .insert(staffEvents)
    .values({
      templeId: actor.templeId,
      visibility: "shared",
      ownerStaffId: actor.staffId ?? assignees[0],
      category,
      title,
      body,
      startAt: input.start,
      endAt: input.end,
      memorialServiceId: input.memorialServiceId ?? null,
    })
    .returning({ id: staffEvents.id });
  await tx
    .insert(staffEventAssignees)
    .values(assignees.map((staffId) => ({ templeId: actor.templeId, staffEventId: row.id, staffId })));
  return row.id;
}

export type PrivateEventInput = {
  /** 省略すると「私用」 */
  category?: EventCategory | string;
  title: string;
  body?: string | null;
  start: Date;
  end: Date;
};

/** 私的な予定を作る。本人（操作者）だけの予定になる。ログインしているスタッフだけが作れる */
export async function createPrivateEvent(actor: Actor, input: PrivateEventInput, conn: DbOrTx = db): Promise<string> {
  rejectPortal(actor);
  requireStaff(actor);
  const category = checkCategory(input.category ?? "私用", "private");
  const title = cleanTitle(input.title);
  const body = cleanBody(input.body);
  checkRange(input.start, input.end, MAX_EVENT_DAYS, "予定");

  return conn.transaction(async (tx) => {
    const [row] = await tx
      .insert(staffEvents)
      .values({
        templeId: actor.templeId,
        visibility: "private",
        ownerStaffId: actor.staffId,
        category,
        title,
        body,
        startAt: input.start,
        endAt: input.end,
      })
      .returning({ id: staffEvents.id });
    // 私的な予定の担当者は本人 1 人（空き判定は担当者で行う）
    await tx.insert(staffEventAssignees).values({ templeId: actor.templeId, staffEventId: row.id, staffId: actor.staffId });
    return row.id;
  });
}

export type EventInput = {
  visibility: EventVisibility;
  category: string;
  title: string;
  body?: string | null;
  start: Date;
  end: Date;
  /** 業務の予定のときだけ使う */
  assigneeStaffIds?: string[];
};

/** 管理画面から予定を作る（私的 / 業務） */
export async function createEvent(actor: Actor, input: EventInput, conn: DbOrTx = db): Promise<string> {
  requireStaff(actor);
  if (input.visibility === "private") return createPrivateEvent(actor, input, conn);
  if (input.visibility !== "shared") throw invalid("予定の種類は、私的か業務のどちらかにしてください");
  return conn.transaction((tx) => createSharedEvent(actor, tx, { ...input, assigneeStaffIds: input.assigneeStaffIds ?? [] }));
}

// ---- 更新と取り消し ----

type EventRow = typeof staffEvents.$inferSelect;

/** 書き換えてよい予定を読む。読めない・直せないときは、私的な予定の存在を明かさないように notFound にする */
async function loadEditable(actor: Actor & { staffId: string }, eventId: string, conn: DbOrTx): Promise<EventRow> {
  const [row] = await conn
    .select()
    .from(staffEvents)
    .where(and(eq(staffEvents.id, eventId), eq(staffEvents.templeId, actor.templeId)));
  if (!row || row.cancelledAt) throw notFound("予定が見つかりません");
  if (row.visibility === "private" && row.ownerStaffId !== actor.staffId) throw notFound("予定が見つかりません");
  if (row.memorialServiceId) throw forbidden("法要の予定は、法要の画面から変更・取り消ししてください");
  return row;
}

export type EventUpdate = {
  category: string;
  title: string;
  body?: string | null;
  start: Date;
  end: Date;
  /** 業務の予定のときだけ使う */
  assigneeStaffIds?: string[];
};

/** 予定を直す。私的な予定は本人だけ、業務の予定はスタッフなら誰でも直せる。種類（私的 / 業務）は変えられない */
export async function updateEvent(actor: Actor, eventId: string, input: EventUpdate, conn: DbOrTx = db): Promise<void> {
  rejectPortal(actor);
  requireStaff(actor);
  await conn.transaction(async (tx) => {
    const row = await loadEditable(actor, eventId, tx);
    const visibility = row.visibility as EventVisibility;
    const category = checkCategory(input.category, visibility);
    const title = cleanTitle(input.title);
    const body = cleanBody(input.body);
    checkRange(input.start, input.end, MAX_EVENT_DAYS, "予定");

    await tx
      .update(staffEvents)
      .set({ category, title, body, startAt: input.start, endAt: input.end })
      .where(eq(staffEvents.id, row.id));

    if (visibility === "shared") {
      const assignees = await checkAssignees(tx, actor.templeId, input.assigneeStaffIds ?? []);
      await tx.delete(staffEventAssignees).where(eq(staffEventAssignees.staffEventId, row.id));
      await tx
        .insert(staffEventAssignees)
        .values(assignees.map((staffId) => ({ templeId: actor.templeId, staffEventId: row.id, staffId })));
    }
  });
}

/** 予定を取り消す（表示も空き判定もしなくなる）。権限は updateEvent と同じ */
export async function cancelEvent(actor: Actor, eventId: string, conn: DbOrTx = db): Promise<void> {
  rejectPortal(actor);
  requireStaff(actor);
  await conn.transaction(async (tx) => {
    const row = await loadEditable(actor, eventId, tx);
    await tx.update(staffEvents).set({ cancelledAt: new Date() }).where(eq(staffEvents.id, row.id));
  });
}

/**
 * 法要の取り消しに合わせて、ひもづく予定を取り消す。04 が同じトランザクションの中で呼ぶ。
 * @returns 取り消した予定の件数
 */
export async function cancelEventsByMemorialService(actor: Actor, tx: DbOrTx, memorialServiceId: string): Promise<number> {
  rejectPortal(actor);
  const rows = await tx
    .update(staffEvents)
    .set({ cancelledAt: new Date() })
    .where(
      and(
        eq(staffEvents.templeId, actor.templeId),
        eq(staffEvents.memorialServiceId, memorialServiceId),
        isNull(staffEvents.cancelledAt),
      ),
    )
    .returning({ id: staffEvents.id });
  return rows.length;
}

// ---- 読み取り（私的な予定の保護） ----

/** 閲覧者のスタッフの ID。ポータルからは読めない。スタッフでない操作者（シードなど）は、私的な予定をすべて「予定あり」として見る */
function viewerOf(actor: Actor): string | null {
  rejectPortal(actor);
  return actor.staffId ?? null;
}

/**
 * 予定を読む唯一の入口。閲覧者が内容を見てよい予定（業務の予定、または本人の私的な予定）でなければ、
 * タイトル・内容・カテゴリ・法要の ID を SQL の時点で NULL にして読む
 */
async function selectEvents(conn: DbOrTx, templeId: string, viewerStaffId: string | null, where: SQL | undefined) {
  const canSee = viewerStaffId
    ? sql<boolean>`(${staffEvents.visibility} = 'shared' OR ${staffEvents.ownerStaffId} = ${viewerStaffId})`
    : sql<boolean>`(${staffEvents.visibility} = 'shared')`;
  const rows = await conn
    .select({
      id: staffEvents.id,
      visibility: staffEvents.visibility,
      ownerStaffId: staffEvents.ownerStaffId,
      startAt: staffEvents.startAt,
      endAt: staffEvents.endAt,
      canSee: canSee.as("can_see"),
      category: sql<string | null>`CASE WHEN ${canSee} THEN ${staffEvents.category} END`,
      title: sql<string | null>`CASE WHEN ${canSee} THEN ${staffEvents.title} END`,
      body: sql<string | null>`CASE WHEN ${canSee} THEN ${staffEvents.body} END`,
      memorialServiceId: sql<string | null>`CASE WHEN ${canSee} THEN ${staffEvents.memorialServiceId} END`,
    })
    .from(staffEvents)
    .where(and(eq(staffEvents.templeId, templeId), isNull(staffEvents.cancelledAt), where))
    .orderBy(asc(staffEvents.startAt), asc(staffEvents.endAt), asc(staffEvents.id));

  const visibleIds = rows.filter((r) => r.canSee).map((r) => r.id);
  const assigneeRows = visibleIds.length
    ? await conn
        .select({
          staffEventId: staffEventAssignees.staffEventId,
          staffId: staff.id,
          name: staff.name,
          roleTitle: staff.roleTitle,
          isOfficiant: staff.isOfficiant,
          position: staff.position,
        })
        .from(staffEventAssignees)
        .innerJoin(staff, eq(staff.id, staffEventAssignees.staffId))
        .where(inArray(staffEventAssignees.staffEventId, visibleIds))
        .orderBy(asc(staff.position), asc(staff.name))
    : [];
  const assigneesByEvent = new Map<string, EventAssignee[]>();
  for (const a of assigneeRows) {
    const list = assigneesByEvent.get(a.staffEventId) ?? [];
    list.push({ staffId: a.staffId, name: a.name, roleTitle: a.roleTitle, isOfficiant: a.isOfficiant });
    assigneesByEvent.set(a.staffEventId, list);
  }

  return rows.map((r): CalendarEvent => {
    if (!r.canSee) {
      // 他人の私的な予定: 時間と「予定あり」だけ
      return { kind: "busy", visibility: "private", staffId: r.ownerStaffId, label: BUSY_LABEL, start: r.startAt, end: r.endAt };
    }
    return {
      kind: "detail",
      id: r.id,
      visibility: r.visibility as EventVisibility,
      category: r.category as EventCategory,
      title: r.title ?? "",
      body: r.body,
      start: r.startAt,
      end: r.endAt,
      ownerStaffId: r.ownerStaffId,
      memorialServiceId: r.memorialServiceId,
      assignees: assigneesByEvent.get(r.id) ?? [],
      canEdit: viewerStaffId !== null && !r.memorialServiceId,
    };
  });
}

function overlapsRange(from: Date, to: Date): SQL {
  return and(lt(staffEvents.startAt, to), gt(staffEvents.endAt, from))!;
}

function assignedTo(staffIds: string[]): SQL {
  return inArray(
    staffEvents.id,
    db.select({ id: staffEventAssignees.staffEventId }).from(staffEventAssignees).where(inArray(staffEventAssignees.staffId, staffIds)),
  );
}

async function listCalendarStaff(conn: DbOrTx, templeId: string): Promise<CalendarStaff[]> {
  const rows = await conn
    .select()
    .from(staff)
    .where(eq(staff.templeId, templeId))
    .orderBy(asc(staff.position), asc(staff.name));
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    roleTitle: s.roleTitle,
    isOfficiant: s.isOfficiant,
    canLogin: Boolean(s.email && s.passwordHash),
  }));
}

/**
 * 表示用の予定。閲覧者が本人でない私的な予定は、時間と「予定あり」だけにする。
 * staffIds を指定すると、その人たちが担当する予定だけを返す（staff もその人たちだけになる）
 */
export async function getCalendar(
  actor: Actor,
  range: { from: Date; to: Date; staffIds?: string[] },
  conn: DbOrTx = db,
): Promise<CalendarView> {
  const viewer = viewerOf(actor);
  checkRange(range.from, range.to, MAX_RANGE_DAYS, "表示する期間");
  const allStaff = await listCalendarStaff(conn, actor.templeId);
  const filter = range.staffIds && range.staffIds.length > 0 ? new Set(range.staffIds) : null;
  const staffList = filter ? allStaff.filter((s) => filter.has(s.id)) : allStaff;
  if (filter && staffList.length === 0) return { staff: [], events: [] };

  const events = await selectEvents(
    conn,
    actor.templeId,
    viewer,
    and(overlapsRange(range.from, range.to), filter ? assignedTo(staffList.map((s) => s.id)) : undefined),
  );
  return { staff: staffList, events };
}

/** 1 件の予定（編集の画面）。内容を見られない予定（他人の私的な予定）は、存在を明かさずに notFound にする */
export async function getEvent(actor: Actor, eventId: string, conn: DbOrTx = db): Promise<CalendarEventDetail> {
  const viewer = viewerOf(actor);
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw notFound("予定が見つかりません");
  const [event] = await selectEvents(conn, actor.templeId, viewer, eq(staffEvents.id, eventId));
  if (!event || event.kind !== "detail") throw notFound("予定が見つかりません");
  return event;
}

/** 自分の予定（自分が担当する予定。from より後に終わるもの）を開始の順に返す */
export async function listMyEvents(
  actor: Actor,
  opts: { from: Date; to?: Date; limit?: number },
  conn: DbOrTx = db,
): Promise<CalendarEventDetail[]> {
  rejectPortal(actor);
  requireStaff(actor);
  const where = and(
    gt(staffEvents.endAt, opts.from),
    opts.to ? lt(staffEvents.startAt, opts.to) : undefined,
    assignedTo([actor.staffId]),
  );
  const events = await selectEvents(conn, actor.templeId, actor.staffId, where);
  // 自分が担当する予定は、すべて内容を見られる（業務の予定か、自分の私的な予定）
  const mine = events.filter((e): e is CalendarEventDetail => e.kind === "detail");
  return opts.limit ? mine.slice(0, opts.limit) : mine;
}

// ---- 空き判定（04 が使う） ----

/**
 * スタッフごとの「埋まっている時間」。私的な予定も含める（内容は返さない）。
 * 業務の予定は、割り当てた全員の埋まっている時間になる。取り消した予定は含めない。
 * 指定したスタッフ全員のキーを持ち（予定がなければ空の配列）、区間は重なりをまとめて開始の順に並べる。
 * 04 は、確定の前の確かめ直しのときに conn に tx を渡す
 */
export async function getStaffBusyIntervals(
  staffIds: string[],
  range: { from: Date; to: Date },
  conn: DbOrTx = db,
): Promise<Record<string, Interval[]>> {
  const out: Record<string, Interval[]> = {};
  const unique = [...new Set(staffIds)];
  for (const id of unique) out[id] = [];
  if (unique.length === 0 || range.from.getTime() >= range.to.getTime()) return out;

  const rows = await conn
    .select({ staffId: staffEventAssignees.staffId, start: staffEvents.startAt, end: staffEvents.endAt })
    .from(staffEventAssignees)
    .innerJoin(staffEvents, eq(staffEvents.id, staffEventAssignees.staffEventId))
    .where(
      and(
        inArray(staffEventAssignees.staffId, unique),
        isNull(staffEvents.cancelledAt),
        overlapsRange(range.from, range.to),
      ),
    )
    .orderBy(asc(staffEvents.startAt));
  for (const r of rows) out[r.staffId].push({ start: r.start, end: r.end });
  for (const id of unique) out[id] = mergeIntervals(out[id]);
  return out;
}

/** 法要の担当者（is_officiant）のスタッフ。表示順 */
export async function listOfficiants(templeId: string, conn: DbOrTx = db): Promise<Staff[]> {
  return listStaff(templeId, { officiantsOnly: true }, conn);
}
