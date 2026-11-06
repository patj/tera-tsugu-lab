// スタッフの空いている時間（MCP の check_staff_availability などで使う）
import { db, type DbOrTx } from "@/db/client";
import {
  eachDate,
  forbidden,
  freeIntervals,
  invalid,
  jst,
  listStaff,
  overlaps,
  parseDateString,
  parseHHMM,
  type Actor,
  type Interval,
  type Staff,
} from "@/domain/core";
import { getStaffBusyIntervals } from "./events";
import { DAY_END_HOUR, DAY_START_HOUR, MAX_RANGE_DAYS } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
export const DEFAULT_DAY_START = `${pad(DAY_START_HOUR)}:00`;
export const DEFAULT_DAY_END = `${pad(DAY_END_HOUR)}:00`;

const normalize = (s: string) => s.replace(/[\s　]/g, "").toLowerCase();

/**
 * スタッフを ID、名前（空白は無視）、ふりがな、役職（住職、副住職など）で探す。
 * 見つからないとき、複数に当てはまるときは invalid を投げる
 */
export async function resolveStaff(templeId: string, queries: string[], conn: DbOrTx = db): Promise<Staff[]> {
  const all = await listStaff(templeId, {}, conn);
  const out: Staff[] = [];
  for (const q of queries) {
    const n = normalize(q);
    if (!n) continue;
    const byExact = all.filter(
      (s) => s.id === q || normalize(s.name) === n || normalize(s.roleTitle) === n || (s.kana && normalize(s.kana) === n),
    );
    const hits = byExact.length > 0 ? byExact : all.filter((s) => normalize(s.name).includes(n));
    if (hits.length === 0) {
      throw invalid(`スタッフが見つかりません: ${q}（スタッフの名前か役職で指定してください: ${all.map((s) => `${s.roleTitle} ${s.name}`).join("、")}）`);
    }
    if (hits.length > 1) throw invalid(`「${q}」に当てはまるスタッフが複数います: ${hits.map((s) => `${s.roleTitle} ${s.name}`).join("、")}`);
    if (!out.some((s) => s.id === hits[0].id)) out.push(hits[0]);
  }
  return out;
}

export type DayAvailability = {
  date: string;
  /** その日の範囲（dayStart〜dayEnd）の中で空いている時間 */
  free: Interval[];
  /** その日の範囲の中で埋まっている時間（重なりはまとめる。内容は持たない） */
  busy: Interval[];
};

export type StaffAvailability = { staff: Staff; days: DayAvailability[] };

/**
 * 期間（日付。両端を含む）の各日について、dayStart〜dayEnd（日本時間）の中の空いている時間を返す。
 * staffIds を省略すると、法要の担当者（is_officiant）を対象にする。私的な予定も埋まっている時間に入る
 */
export async function getStaffAvailability(
  actor: Actor,
  opts: { fromDate: string; toDate: string; staffIds?: string[]; dayStart?: string; dayEnd?: string },
  conn: DbOrTx = db,
): Promise<StaffAvailability[]> {
  if (actor.channel === "portal" || actor.portalAccountId) throw forbidden("スタッフのカレンダーは、スタッフだけが使えます");
  parseDateString(opts.fromDate);
  parseDateString(opts.toDate);
  if (opts.fromDate > opts.toDate) throw invalid("期間の終わりは、始まりと同じか後の日にしてください");
  const dates = eachDate(opts.fromDate, opts.toDate);
  if (dates.length > MAX_RANGE_DAYS) throw invalid(`期間は ${MAX_RANGE_DAYS} 日以内にしてください`);
  const dayStart = opts.dayStart ?? DEFAULT_DAY_START;
  const dayEnd = opts.dayEnd ?? DEFAULT_DAY_END;
  if (parseHHMM(dayStart) >= parseHHMM(dayEnd)) throw invalid("1 日の範囲の終わりは、始まりより後にしてください");

  const all = await listStaff(actor.templeId, {}, conn);
  const targets =
    opts.staffIds && opts.staffIds.length > 0
      ? all.filter((s) => opts.staffIds!.includes(s.id))
      : all.filter((s) => s.isOfficiant);

  const range = { from: jst(dates[0], dayStart), to: jst(dates[dates.length - 1], dayEnd) };
  const busy = await getStaffBusyIntervals(
    targets.map((s) => s.id),
    range,
    conn,
  );

  return targets.map((s) => ({
    staff: s,
    days: dates.map((date) => {
      const window = { start: jst(date, dayStart), end: jst(date, dayEnd) };
      const inDay = busy[s.id]
        .filter((b) => overlaps(b, window))
        .map((b) => ({
          start: new Date(Math.max(b.start.getTime(), window.start.getTime())),
          end: new Date(Math.min(b.end.getTime(), window.end.getTime())),
        }));
      return { date, free: freeIntervals(window, inDay), busy: inDay };
    }),
  }));
}
