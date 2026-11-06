// 画面の日付の扱い（週表示と月表示、URL の日付の検証）
import { addDays, jst, jstParts, parseDateString } from "@/domain/core";

/** URL などから来た値が "YYYY-MM-DD" の正しい日付ならそのまま、そうでなければ null */
export function parseDateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    parseDateString(v);
    return v;
  } catch {
    return null;
  }
}

/** その日を含む週の月曜日 */
export function weekStart(date: string): string {
  const wd = jstParts(jst(date)).weekday;
  return addDays(date, -((wd + 6) % 7));
}

/** その月の 1 日 */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** その月の末日 */
export function monthEnd(date: string): string {
  const { year, month } = parseDateString(monthStart(date));
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}

/** 月表示のマス目（月曜始まりで、前後の月の日を含めて 7 の倍数の日数） */
export function monthGridDates(date: string): string[] {
  const first = weekStart(monthStart(date));
  const last = addDays(weekStart(monthEnd(date)), 6);
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 月を足す（日は 1 日にそろえる） */
export function addMonths(date: string, n: number): string {
  const { year, month } = parseDateString(monthStart(date));
  const idx = year * 12 + (month - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
}

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/** "12/6（日）" */
export function shortDateLabel(date: string): string {
  const { month, day } = parseDateString(date);
  return `${month}/${day}（${WEEKDAY_LABELS[jstParts(jst(date)).weekday]}）`;
}
