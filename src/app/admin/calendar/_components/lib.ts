// カレンダーの画面で使う、日付と表示の小さな関数（画面の形を作るだけ。業務のロジックはドメイン層）
import type { CalendarEvent, EventCategory } from "@/domain/calendar";
import { addDays, jst, jstDateString, jstParts, jstTimeString, parseDateString, todayJst } from "@/domain/core";

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 法要の詳細の画面（04）。04 の画面ができたら、ここだけをそろえる */
export function memorialServiceHref(memorialServiceId: string): string {
  return `/admin/memorial/services/${memorialServiceId}`;
}

/** searchParams の日付。正しくなければ今日 */
export function dateParam(v: string | string[] | undefined): string {
  const s = typeof v === "string" ? v : "";
  try {
    parseDateString(s);
    return s;
  } catch {
    return todayJst();
  }
}

/** searchParams の月（"YYYY-MM"）。正しくなければ今月 */
export function monthParam(v: string | string[] | undefined): string {
  const s = typeof v === "string" ? v : "";
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s;
  return todayJst().slice(0, 7);
}

export function weekdayOf(date: string): number {
  return jstParts(jst(date)).weekday;
}

/** その日を含む週の月曜日（週は月曜始まり。土日のお寺の行事が週の終わりに並ぶように） */
export function weekStart(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** "11/6（金）" */
export function shortDate(date: string): string {
  const { month, day } = parseDateString(date);
  return `${month}/${day}（${WEEKDAYS[weekdayOf(date)]}）`;
}

/** "2026 年 11 月 6 日（金）" */
export function longDate(date: string): string {
  const { year, month, day } = parseDateString(date);
  return `${year} 年 ${month} 月 ${day} 日（${WEEKDAYS[weekdayOf(date)]}）`;
}

/** 予定の時間の表示。その日の中だけなら "10:00〜11:00"、日をまたぐなら日付もつける */
export function timeLabel(e: { start: Date; end: Date }, onDate?: string): string {
  const sd = jstDateString(e.start);
  const ed = jstDateString(new Date(e.end.getTime() - 1));
  if (sd === ed && (!onDate || onDate === sd)) return `${jstTimeString(e.start)}〜${jstTimeString(e.end)}`;
  const s = sd === onDate ? jstTimeString(e.start) : `${shortDate(sd)} ${jstTimeString(e.start)}`;
  const en = ed === onDate ? jstTimeString(e.end) : `${shortDate(ed)} ${jstTimeString(e.end)}`;
  return `${s}〜${en}`;
}

/** その日（日本時間）に重なる予定か */
export function onDay(e: { start: Date; end: Date }, date: string): boolean {
  const from = jst(date).getTime();
  const to = jst(addDays(date, 1)).getTime();
  return e.start.getTime() < to && e.end.getTime() > from;
}

/** 予定の見た目（カテゴリごとの色。他人の私的な予定は灰色） */
export function eventColor(e: CalendarEvent): string {
  if (e.kind === "busy") return "border-stone-400 bg-stone-200 text-stone-700";
  return CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS["その他"];
}

const CATEGORY_COLORS: Record<EventCategory, string> = {
  法要: "border-purple-500 bg-purple-50 text-purple-950",
  行事: "border-amber-500 bg-amber-50 text-amber-950",
  外出: "border-sky-500 bg-sky-50 text-sky-950",
  来客: "border-emerald-500 bg-emerald-50 text-emerald-950",
  その他: "border-stone-500 bg-white text-stone-900",
  私用: "border-rose-400 bg-rose-50 text-rose-950",
};

export function eventTitle(e: CalendarEvent): string {
  return e.kind === "busy" ? e.label : e.title;
}
