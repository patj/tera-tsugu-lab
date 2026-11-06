// 施設の予約（作成、承認、お断り、取り消し、一覧）。spec.md §6
// 重なりはここで確かめ、すり抜けた場合も DB の排他制約（reservations_no_overlap）で止めて conflict にする。
import { and, asc, eq, gt, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { facilities, reservations } from "@/db/schema";
import {
  conflict,
  forbidden,
  formatJst,
  invalid,
  isConstraintViolation,
  isStaff,
  jstTimeString,
  notFound,
  type Actor,
} from "@/domain/core";
import {
  BUSY_STATUSES,
  PUBLIC_KINDS,
  isReservationKind,
  kindLabel,
  statusLabel,
  type ReservationKind,
  type ReservationStatus,
} from "./constants";
import { getFacility } from "./facilities";
import { getContactsByIds, getHouseholdNamesByIds } from "./ledger-adapter";
import { generateRequestCode, normalizeRequestCode } from "./request-code";

export type Reservation = {
  id: string;
  templeId: string;
  facilityId: string;
  facilityName: string;
  kind: ReservationKind;
  status: ReservationStatus;
  start: Date;
  end: Date;
  householdId: string | null;
  contactId: string | null;
  memorialServiceId: string | null;
  requestCode: string | null;
  title: string | null;
  notes: string | null;
  rejectReason: string | null;
  createdAt: Date;
};

/** 一覧や詳細に出す、申請者の情報つきの予約 */
export type ReservationWithParty = Reservation & {
  /** 一般コンタクトの氏名、世帯の名前（〇〇家）、またはなし */
  partyName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
};

export type CreateReservationInput = {
  facilityId: string;
  kind: ReservationKind;
  /** 作るときは pending（申請中）か confirmed（確定）だけ */
  status: "pending" | "confirmed";
  /** 準備と片付けを含む */
  start: Date;
  end: Date;
  householdId?: string | null;
  contactId?: string | null;
  memorialServiceId?: string | null;
  title?: string | null;
  notes?: string | null;
};

const selectColumns = {
  id: reservations.id,
  templeId: reservations.templeId,
  facilityId: reservations.facilityId,
  facilityName: facilities.name,
  kind: reservations.kind,
  status: reservations.status,
  start: reservations.startAt,
  end: reservations.endAt,
  householdId: reservations.householdId,
  contactId: reservations.contactId,
  memorialServiceId: reservations.memorialServiceId,
  requestCode: reservations.requestCode,
  title: reservations.title,
  notes: reservations.notes,
  rejectReason: reservations.rejectReason,
  createdAt: reservations.createdAt,
};

type Row = Omit<Reservation, "kind" | "status"> & { kind: string; status: string };

function toReservation(row: Row): Reservation {
  return { ...row, kind: row.kind as ReservationKind, status: row.status as ReservationStatus };
}

function baseQuery(conn: DbOrTx) {
  return conn.select(selectColumns).from(reservations).innerJoin(facilities, eq(facilities.id, reservations.facilityId));
}

async function selectReservations(conn: DbOrTx, where: SQL | undefined, order: SQL[] = []): Promise<Reservation[]> {
  const rows = await baseQuery(conn)
    .where(where)
    .orderBy(...order, asc(reservations.startAt), asc(facilities.position));
  return rows.map((r) => toReservation(r as Row));
}

/** "2026-12-06（日）10:00〜12:00" */
export function formatRange(start: Date, end: Date): string {
  return `${formatJst(start)}〜${jstTimeString(end)}`;
}

function requireStaff(actor: Actor, what: string): void {
  if (!isStaff(actor)) throw forbidden(`${what}はスタッフだけができます`);
}

const overlapsWhere = (start: Date, end: Date) => and(lt(reservations.startAt, end), gt(reservations.endAt, start));
const busyWhere = () => inArray(reservations.status, [...BUSY_STATUSES]);

/** 同じ施設で、指定した時間に重なる申請中・確定の予約（excludeId の予約は除く） */
export async function findConflicts(
  facilityId: string,
  range: { start: Date; end: Date },
  excludeId?: string,
  conn: DbOrTx = db,
): Promise<Reservation[]> {
  return selectReservations(
    conn,
    and(
      eq(reservations.facilityId, facilityId),
      busyWhere(),
      overlapsWhere(range.start, range.end),
      excludeId ? ne(reservations.id, excludeId) : undefined,
    ),
  );
}

function conflictMessage(actor: Actor, facilityName: string, found: Reservation[]): string {
  if (!isStaff(actor) || found.length === 0) {
    return `${facilityName}は、その時間にすでに予約が入っています。空き状況を確かめて、別の日時を選んでください`;
  }
  const list = found
    .map((r) => `${formatRange(r.start, r.end)} ${kindLabel(r.kind)}（${statusLabel(r.status)}${r.requestCode ? `、${r.requestCode}` : ""}）`)
    .join("、");
  return `${facilityName}は、その時間に別の予約と重なります: ${list}`;
}

/** 使われていない申請番号を作る（30^8 通りなので衝突はまずないが、念のため確かめる） */
async function newRequestCode(conn: DbOrTx): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateRequestCode();
    const [hit] = await conn.select({ id: reservations.id }).from(reservations).where(eq(reservations.requestCode, code));
    if (!hit) return code;
  }
  throw new Error("申請番号を発行できませんでした");
}

function validateRange(start: Date, end: Date): void {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw invalid("日時が正しくありません");
  if (start.getTime() >= end.getTime()) throw invalid("終わりの時刻は、始まりの時刻より後にしてください");
}

/**
 * 予約を作る。同じ施設の申請中・確定の予約と重なれば conflict。
 * 04 が法要を確定するときに、同じトランザクションの中で呼ぶ（kind = memorial、status = confirmed）。
 * スタッフ以外（公開ページの申請者）は、申請中の前撮り・茶会・その他だけを作れる。
 */
export async function createReservation(
  actor: Actor,
  tx: DbOrTx,
  input: CreateReservationInput,
): Promise<Reservation> {
  if (!isReservationKind(input.kind)) throw invalid(`予約の種類が正しくありません: ${input.kind}`);
  if (input.status !== "pending" && input.status !== "confirmed") {
    throw invalid("予約は、申請中（pending）か確定（confirmed）で作ってください");
  }
  if (!isStaff(actor)) {
    if (input.status !== "pending") throw forbidden("確定の予約はスタッフだけが作れます");
    if (!(PUBLIC_KINDS as readonly string[]).includes(input.kind)) throw forbidden("この種類の予約は申請できません");
  }
  validateRange(input.start, input.end);
  const facility = await getFacility(actor.templeId, input.facilityId, tx);

  const found = await findConflicts(facility.id, input, undefined, tx);
  if (found.length > 0) throw conflict(conflictMessage(actor, facility.name, found));

  const requestCode = await newRequestCode(tx);
  let id: string;
  try {
    // セーブポイントの中で入れる。排他制約に当たっても、呼び出し側のトランザクションは壊さない
    id = await tx.transaction(async (sp) => {
      const [row] = await sp
        .insert(reservations)
        .values({
          templeId: actor.templeId,
          facilityId: facility.id,
          kind: input.kind,
          status: input.status,
          startAt: input.start,
          endAt: input.end,
          householdId: input.householdId ?? null,
          contactId: input.contactId ?? null,
          memorialServiceId: input.memorialServiceId ?? null,
          requestCode,
          title: input.title?.trim() || null,
          notes: input.notes?.trim() || null,
        })
        .returning({ id: reservations.id });
      return row.id;
    });
  } catch (e) {
    if (isConstraintViolation(e, "reservations_no_overlap")) {
      throw conflict(conflictMessage(actor, facility.name, []));
    }
    if (isConstraintViolation(e, "reservations_time_order")) throw invalid("終わりの時刻は、始まりの時刻より後にしてください");
    throw e;
  }
  return getReservation(actor.templeId, id, tx);
}

/** 予約を 1 つ取る。なければ notFound */
export async function getReservation(templeId: string, id: string, conn: DbOrTx = db): Promise<Reservation> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("予約が見つかりません");
  const [r] = await selectReservations(conn, and(eq(reservations.templeId, templeId), eq(reservations.id, id)));
  if (!r) throw notFound("予約が見つかりません");
  return r;
}

/** 申請番号で予約を取る。なければ null */
export async function findReservationByCode(templeId: string, code: string, conn: DbOrTx = db): Promise<Reservation | null> {
  const normalized = normalizeRequestCode(code);
  if (!normalized) return null;
  const [r] = await selectReservations(
    conn,
    and(eq(reservations.templeId, templeId), eq(reservations.requestCode, normalized)),
  );
  return r ?? null;
}

/** 申請番号か ID で予約を取る（MCP 用）。なければ notFound */
export async function findReservation(templeId: string, codeOrId: string, conn: DbOrTx = db): Promise<Reservation> {
  const byCode = await findReservationByCode(templeId, codeOrId, conn);
  if (byCode) return byCode;
  return getReservation(templeId, codeOrId.trim(), conn);
}

async function lockReservation(conn: DbOrTx, templeId: string, id: string): Promise<Reservation> {
  // 同じ予約を同時に承認・お断りしないように、行をロックしてから状態を見る
  await conn.execute(sql`SELECT 1 FROM reservations WHERE id = ${id} AND temple_id = ${templeId} FOR UPDATE`);
  return getReservation(templeId, id, conn);
}

/** 申請中の予約を承認する（pending → confirmed）。承認するときにも重なりを確かめ直す */
export async function approveReservation(actor: Actor, tx: DbOrTx, id: string): Promise<Reservation> {
  requireStaff(actor, "予約の承認");
  return tx.transaction(async (t) => {
    const r = await lockReservation(t, actor.templeId, id);
    if (r.status !== "pending") throw invalid(`この予約は${statusLabel(r.status)}なので、承認できません`);
    const found = await findConflicts(r.facilityId, r, r.id, t);
    if (found.length > 0) throw conflict(conflictMessage(actor, r.facilityName, found));
    await t
      .update(reservations)
      .set({ status: "confirmed" })
      .where(and(eq(reservations.id, r.id), eq(reservations.status, "pending")));
    return getReservation(actor.templeId, r.id, t);
  });
}

/** 申請中の予約を、理由を添えて断る（pending → rejected）。申請者は申請番号の画面で理由を見られる */
export async function rejectReservation(actor: Actor, tx: DbOrTx, id: string, reason: string): Promise<Reservation> {
  requireStaff(actor, "予約のお断り");
  const why = reason.trim();
  if (!why) throw invalid("お断りの理由を入力してください（申請者に表示されます）");
  return tx.transaction(async (t) => {
    const r = await lockReservation(t, actor.templeId, id);
    if (r.status !== "pending") throw invalid(`この予約は${statusLabel(r.status)}なので、お断りできません`);
    await t
      .update(reservations)
      .set({ status: "rejected", rejectReason: why })
      .where(and(eq(reservations.id, r.id), eq(reservations.status, "pending")));
    return getReservation(actor.templeId, r.id, t);
  });
}

/** 予約を取り消す（申請中・確定 → cancelled）。管理画面からだけ使う（MCP では取り消さない）。法要の予約は法要の取り消しから行う */
export async function cancelReservation(actor: Actor, tx: DbOrTx, id: string): Promise<Reservation> {
  requireStaff(actor, "予約の取り消し");
  return tx.transaction(async (t) => {
    const r = await lockReservation(t, actor.templeId, id);
    if (r.memorialServiceId) throw invalid("法要の予約は、法要の取り消しから取り消してください");
    if (r.status !== "pending" && r.status !== "confirmed") {
      throw invalid(`この予約は${statusLabel(r.status)}なので、取り消せません`);
    }
    await t.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, r.id));
    return getReservation(actor.templeId, r.id, t);
  });
}

/** 法要にひもづく予約をすべて取り消す（04 が法要を取り消すときに、同じトランザクションの中で呼ぶ）。取り消した件数を返す */
export async function cancelReservationsByMemorialService(
  actor: Actor,
  tx: DbOrTx,
  memorialServiceId: string,
): Promise<number> {
  requireStaff(actor, "予約の取り消し");
  const rows = await tx
    .update(reservations)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(reservations.templeId, actor.templeId),
        eq(reservations.memorialServiceId, memorialServiceId),
        busyWhere(),
      ),
    )
    .returning({ id: reservations.id });
  return rows.length;
}

export type ListReservationsOptions = {
  /** 状態で絞り込む（省略するとすべて） */
  statuses?: ReservationStatus[];
  facilityId?: string;
  /** この時間に重なる予約だけ */
  from?: Date;
  to?: Date;
  limit?: number;
};

/** 予約の一覧。承認待ち（申請中）を先頭に、そのあとは日時の順 */
export async function listReservations(
  templeId: string,
  opts: ListReservationsOptions = {},
  conn: DbOrTx = db,
): Promise<ReservationWithParty[]> {
  const where = and(
    eq(reservations.templeId, templeId),
    opts.statuses && opts.statuses.length > 0 ? inArray(reservations.status, opts.statuses) : undefined,
    opts.facilityId ? eq(reservations.facilityId, opts.facilityId) : undefined,
    opts.to ? lt(reservations.startAt, opts.to) : undefined,
    opts.from ? gt(reservations.endAt, opts.from) : undefined,
  );
  let list = await selectReservations(conn, where, [sql`CASE WHEN ${reservations.status} = 'pending' THEN 0 ELSE 1 END`]);
  if (opts.limit) list = list.slice(0, opts.limit);
  return withParty(list, conn);
}

/** 予約に、申請者（一般コンタクト）か世帯の名前をつける */
export async function withParty(list: Reservation[], conn: DbOrTx = db): Promise<ReservationWithParty[]> {
  const contacts = await getContactsByIds([...new Set(list.flatMap((r) => (r.contactId ? [r.contactId] : [])))], conn);
  const households = await getHouseholdNamesByIds(
    [...new Set(list.flatMap((r) => (r.householdId ? [r.householdId] : [])))],
    conn,
  );
  return list.map((r) => {
    const c = r.contactId ? contacts.get(r.contactId) : undefined;
    const h = r.householdId ? households.get(r.householdId) : undefined;
    return {
      ...r,
      partyName: c?.name ?? h ?? null,
      contactPhone: c?.phone ?? null,
      contactEmail: c?.email ?? null,
    };
  });
}

/**
 * 予約と同じ時間に入っている、ほかの申請中・確定の予約（法要を含む）。承認の前に「法要と重ならないか」を確かめるのに使う。
 * 同じ施設の予約とは、排他制約があるので重ならない（sameFacility は空になる）。
 */
export async function findConcurrentReservations(
  templeId: string,
  r: Pick<Reservation, "id" | "facilityId" | "start" | "end">,
  conn: DbOrTx = db,
): Promise<{ sameFacility: Reservation[]; otherFacilities: Reservation[] }> {
  const list = await selectReservations(
    conn,
    and(eq(reservations.templeId, templeId), busyWhere(), overlapsWhere(r.start, r.end), ne(reservations.id, r.id)),
  );
  return {
    sameFacility: list.filter((x) => x.facilityId === r.facilityId),
    otherFacilities: list.filter((x) => x.facilityId !== r.facilityId),
  };
}
