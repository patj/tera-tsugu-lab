// 年忌の計算（spec.md §2）。DB を使わない純粋な関数。
// - 亡くなった年を 1 回忌として数える。n 回忌は「没年 + (n − 1) 年」
// - 2 回忌（没年の翌年）を「一周忌」と呼ぶ。1 回忌（没年）の年忌法要は営まない
// - 祥月命日は亡くなった月日。2/29 に亡くなった方は、うるう年でない年は 2/28 とする（01-ledger.md【決定】）
import { jstDateString, parseDateString } from "@/domain/core/time";
import type { SectPreset } from "@/domain/core/sect";

/** 没年月日。"YYYY-MM-DD"（DB の date の列はこの形で返る）か Date（日本時間の日付として扱う） */
export type DeathDateInput = string | Date;

function parts(deathDate: DeathDateInput): { year: number; month: number; day: number } {
  return parseDateString(typeof deathDate === "string" ? deathDate : jstDateString(deathDate));
}

function assertKaiki(n: number) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`回忌は 1 以上の整数で指定してください: ${n}`);
}

/** その年が何回忌か（没年が 1）。没年より前の年は 0 以下になる */
export function kaikiOfYear(deathDate: DeathDateInput, year: number): number {
  return year - parts(deathDate).year + 1;
}

/** n 回忌の年（没年 + n − 1） */
export function yearOfKaiki(deathDate: DeathDateInput, n: number): number {
  assertKaiki(n);
  return parts(deathDate).year + n - 1;
}

const DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 1〜999 を漢数字にする（13 → 十三、50 → 五十、100 → 百） */
export function toKanjiNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) return String(n);
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  const hs = h === 0 ? "" : h === 1 ? "百" : `${DIGITS[h]}百`;
  const ts = t === 0 ? "" : t === 1 ? "十" : `${DIGITS[t]}十`;
  return hs + ts + DIGITS[o];
}

/**
 * 回忌の呼び名。2 → 「一周忌」、3 → 「三回忌」、13 → 「十三回忌」。
 * preset は宗派ごとに呼び方を変えるときのために受け取る（日蓮宗では上の呼び方）
 */
export function kaikiName(n: number, preset?: SectPreset): string {
  void preset;
  assertKaiki(n);
  if (n === 2) return "一周忌";
  return `${toKanjiNumber(n)}回忌`;
}

/** 宗派プリセットの年忌の一覧に入っているか（年忌法要を営む回忌か） */
export function isMemorialKaiki(n: number, preset: SectPreset): boolean {
  return preset.kaikiList.includes(n);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** その年の祥月命日（"YYYY-MM-DD"）。2/29 に亡くなった方は、うるう年でない年は 2/28 */
export function shoutsukiMeinichi(deathDate: DeathDateInput, year: number): string {
  const { month, day } = parts(deathDate);
  const d = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;
  return `${pad(year, 4)}-${pad(month)}-${pad(d)}`;
}

export type MemorialOccurrence = {
  /** 回忌（一周忌は 2） */
  kaiki: number;
  /** 呼び名（「七回忌」など） */
  kaikiName: string;
  year: number;
  /** その年の祥月命日（"YYYY-MM-DD"） */
  meinichi: string;
};

/** 年忌の 1 回分（その年が年忌法要を営む回忌でなければ null） */
export function memorialInYear(
  deathDate: DeathDateInput,
  year: number,
  preset: SectPreset,
): MemorialOccurrence | null {
  const kaiki = kaikiOfYear(deathDate, year);
  if (kaiki < 1 || !isMemorialKaiki(kaiki, preset)) return null;
  return { kaiki, kaikiName: kaikiName(kaiki, preset), year, meinichi: shoutsukiMeinichi(deathDate, year) };
}

/** fromYear〜toYear（両端を含む）に迎える年忌の一覧（年の順） */
export function memorialsBetweenYears(
  deathDate: DeathDateInput,
  fromYear: number,
  toYear: number,
  preset: SectPreset,
): MemorialOccurrence[] {
  const out: MemorialOccurrence[] = [];
  for (const kaiki of [...preset.kaikiList].sort((a, b) => a - b)) {
    const year = yearOfKaiki(deathDate, kaiki);
    if (year >= fromYear && year <= toYear) out.push(memorialInYear(deathDate, year, preset)!);
  }
  return out;
}

/**
 * 次の年忌: 祥月命日が today（"YYYY-MM-DD"）以降になる、いちばん近い年忌。
 * 年忌の一覧をすべて終えていれば null
 */
export function nextMemorial(
  deathDate: DeathDateInput,
  today: string,
  preset: SectPreset,
): MemorialOccurrence | null {
  const thisYear = parseDateString(today).year;
  for (const m of memorialsBetweenYears(deathDate, thisYear, Number.MAX_SAFE_INTEGER, preset)) {
    if (m.meinichi >= today) return m;
  }
  return null;
}
