// 施設の埋まっている時間と、空き状況（◯×）。
// ◯×は、日ごとの午前（0:00〜12:00）と午後（12:00〜24:00）。予約の内容（法要か、誰の予約か）は返さない。
import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { reservations } from "@/db/schema";
import {
  eachDate,
  getDefaultTempleId,
  invalid,
  jst,
  jstDayRange,
  jstParts,
  overlaps,
  parseDateString,
  type Interval,
} from "@/domain/core";
import { AVAILABILITY_SLOTS, BUSY_STATUSES, type AvailabilitySlotKey } from "./constants";
import { listFacilities } from "./facilities";

/**
 * 施設の埋まっている時間（申請中と確定の予約。申請中も埋まっているとみなす）。開始の順。
 * 04 が法要の候補を出すときと、確定の前に確かめ直すときに使う（トランザクションの中なら conn に tx を渡す）。
 */
export async function getFacilityBusyIntervals(
  facilityId: string,
  range: { from: Date; to: Date },
  conn: DbOrTx = db,
): Promise<Interval[]> {
  const rows = await conn
    .select({ start: reservations.startAt, end: reservations.endAt })
    .from(reservations)
    .where(
      and(
        eq(reservations.facilityId, facilityId),
        inArray(reservations.status, [...BUSY_STATUSES]),
        lt(reservations.startAt, range.to),
        gt(reservations.endAt, range.from),
      ),
    )
    .orderBy(asc(reservations.startAt));
  return rows;
}

export type AvailabilityDay = {
  /** "YYYY-MM-DD" */
  date: string;
  /** 0 = 日曜 */
  weekday: number;
  /** true なら◯（空いている）、false なら×（申請中か確定の予約がある） */
  available: Record<AvailabilitySlotKey, boolean>;
};

export type Availability = {
  from: string;
  to: string;
  slots: { key: AvailabilitySlotKey; label: string }[];
  facilities: { id: string; name: string; days: AvailabilityDay[] }[];
};

/** 一度に返す日数の上限 */
const MAX_DAYS = 366;

/** その日（日本時間）の午前・午後の区間 */
export function slotInterval(date: string, key: AvailabilitySlotKey): Interval {
  const s = AVAILABILITY_SLOTS.find((x) => x.key === key)!;
  return { start: jst(date, s.start), end: jst(date, s.end) };
}

/**
 * 施設ごとの空き状況（◯×）。from と to は "YYYY-MM-DD"（両端を含む）。
 * 公開ページと檀家ポータル（06）で使う。操作者がいない入口なので、templeId を省くと既定のお寺にする。
 */
export async function getAvailability(
  opts: { from: string; to: string; templeId?: string; facilityIds?: string[] },
  conn: DbOrTx = db,
): Promise<Availability> {
  try {
    parseDateString(opts.from);
    parseDateString(opts.to);
  } catch (e) {
    throw invalid((e as Error).message);
  }
  if (opts.from > opts.to) throw invalid("期間の終わりは、始まりより後にしてください");
  const dates = eachDate(opts.from, opts.to);
  if (dates.length > MAX_DAYS) throw invalid(`期間は ${MAX_DAYS} 日までにしてください`);

  const templeId = opts.templeId ?? (await getDefaultTempleId(conn));
  let list = await listFacilities(templeId, conn);
  if (opts.facilityIds) list = list.filter((f) => opts.facilityIds!.includes(f.id));

  const range = { from: jstDayRange(opts.from).start, to: jstDayRange(opts.to).end };
  const out: Availability = {
    from: opts.from,
    to: opts.to,
    slots: AVAILABILITY_SLOTS.map((s) => ({ key: s.key, label: s.label })),
    facilities: [],
  };
  for (const f of list) {
    const busy = await getFacilityBusyIntervals(f.id, range, conn);
    out.facilities.push({
      id: f.id,
      name: f.name,
      days: dates.map((date) => ({
        date,
        weekday: jstParts(jst(date)).weekday,
        available: Object.fromEntries(
          AVAILABILITY_SLOTS.map((s) => [s.key, !busy.some((b) => overlaps(b, slotInterval(date, s.key)))]),
        ) as Record<AvailabilitySlotKey, boolean>,
      })),
    });
  }
  return out;
}
