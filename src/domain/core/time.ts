// 時間の区間と、日本時間（Asia/Tokyo）の日時の扱い。
// DB は timestamptz で持ち、画面と MCP では日本時間で表す。日本には夏時間がないので、+09:00 の固定で計算する。

export type Interval = { start: Date; end: Date };

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const JST_OFFSET_MIN = 9 * 60;

// ---- 区間 ----

/** 2 つの区間が重なるか。端がちょうど接する場合（10:00〜11:00 と 11:00〜12:00）は重ならない */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** 区間が、一覧のどれとも重ならないか */
export function isFree(range: Interval, busy: Interval[]): boolean {
  return !busy.some((b) => overlaps(range, b));
}

/** 重なる区間と接する区間を 1 つにまとめ、開始の順に並べる */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list
    .filter((i) => i.start.getTime() < i.end.getTime())
    .map((i) => ({ start: new Date(i.start), end: new Date(i.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
    } else {
      out.push(cur);
    }
  }
  return out;
}

/** range の中で、busy のどれとも重ならない時間（空いている時間）を返す */
export function freeIntervals(range: Interval, busy: Interval[]): Interval[] {
  const merged = mergeIntervals(busy);
  const out: Interval[] = [];
  let cursor = range.start.getTime();
  const end = range.end.getTime();
  for (const b of merged) {
    const bs = b.start.getTime();
    const be = b.end.getTime();
    if (be <= cursor) continue;
    if (bs >= end) break;
    if (bs > cursor) out.push({ start: new Date(cursor), end: new Date(bs) });
    cursor = Math.max(cursor, be);
    if (cursor >= end) break;
  }
  if (cursor < end) out.push({ start: new Date(cursor), end: new Date(end) });
  return out;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE);
}

export function durationMinutes(i: Interval): number {
  return Math.round((i.end.getTime() - i.start.getTime()) / MINUTE);
}

// ---- 日本時間 ----

export type JstParts = {
  year: number;
  month: number; // 1〜12
  day: number;
  hour: number;
  minute: number;
  /** 0 = 日曜 */
  weekday: number;
};

export function jstParts(date: Date): JstParts {
  const d = new Date(date.getTime() + JST_OFFSET_MIN * MINUTE);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** "YYYY-MM-DD"（日本時間の日付） */
export function jstDateString(date: Date): string {
  const p = jstParts(date);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:MM"（日本時間の時刻） */
export function jstTimeString(date: Date): string {
  const p = jstParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "2027-03-15（月）10:00" のような表示 */
export function formatJst(date: Date): string {
  const p = jstParts(date);
  return `${jstDateString(date)}（${WEEKDAYS[p.weekday]}）${jstTimeString(date)}`;
}

/** "YYYY-MM-DD" を検証して、年・月・日を返す */
export function parseDateString(s: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`日付は YYYY-MM-DD の形で指定してください: ${s}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error(`存在しない日付です: ${s}`);
  }
  return { year, month, day };
}

/** "HH:MM" を、0:00 からの分に変える */
export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`時刻は HH:MM の形で指定してください: ${s}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) throw new Error(`時刻が正しくありません: ${s}`);
  return h * 60 + min;
}

/** 日本時間の日付と時刻から Date を作る。jst("2027-03-15", "10:00") */
export function jst(dateStr: string, time = "00:00"): Date {
  const { year, month, day } = parseDateString(dateStr);
  const minutes = parseHHMM(time);
  return new Date(Date.UTC(year, month - 1, day) + (minutes - JST_OFFSET_MIN) * MINUTE);
}

/**
 * 日時の文字列を Date にする。タイムゾーンがなければ日本時間とみなす。
 * 受け付ける形: "2027-03-15T10:00"、"2027-03-15 10:00"、"2027-03-15T10:00:00+09:00"、"2027-03-15"（0:00）
 */
export function parseJstDateTime(s: string): Date {
  const t = s.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) throw new Error(`日時が正しくありません: ${s}`);
    return d;
  }
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}:\d{2})(?::\d{2})?)?$/.exec(t);
  if (!m) throw new Error(`日時は "YYYY-MM-DD HH:MM" の形で指定してください: ${s}`);
  return jst(m[1], m[2] ?? "00:00");
}

/** その日（日本時間）の 0:00〜翌日 0:00 */
export function jstDayRange(dateStr: string): Interval {
  const start = jst(dateStr);
  return { start, end: new Date(start.getTime() + DAY) };
}

/** "YYYY-MM-DD" に日数を足す */
export function addDays(dateStr: string, days: number): string {
  return jstDateString(new Date(jst(dateStr).getTime() + days * DAY));
}

/** from から to まで（両端を含む）の日付の一覧 */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 今日（日本時間）の "YYYY-MM-DD" */
export function todayJst(now: Date = new Date()): string {
  return jstDateString(now);
}
