// 法要の候補の日時（find_memorial_slots。spec.md §3「候補の出し方」）
// - 開始時刻はお寺の設定（初期値 10:00〜15:00、1 時間刻み）
// - お寺: 本堂と担当者を「法要の長さ＋前後の準備と片付け」で押さえる。申請中の施設予約も埋まっているとみなす
// - 自宅・墓前: 本堂は見ない。担当者を「行きの移動時間＋法要＋帰りの移動時間」で押さえる
// - 祥月命日より前の日を先に並べる
import { db, type DbOrTx } from "@/db/client";
import { getStaffBusyIntervals, listOfficiants } from "@/domain/calendar";
import {
  addDays,
  addMinutes,
  eachDate,
  getTemple,
  invalid,
  isFree,
  jst,
  parseDateString,
  parseHHMM,
  type Actor,
  type Interval,
  type Staff,
  type TempleSettings,
} from "@/domain/core";
import { getFacilityBusyIntervals, getMainHallId } from "@/domain/facility";
import { shoutsukiMeinichi } from "@/domain/ledger";
import { assertStaff, checkDate, fullName, personsByIds } from "./common";
import { isMemorialLocation, type MemorialLocation } from "./types";

/** 一度に調べられる日数の上限 */
export const MAX_SLOT_DAYS = 62;
/** 返す候補（開始時刻）の数の初期値と上限。1 か月分（31 日 × 6 枠）が入る数にする */
export const DEFAULT_SLOT_LIMIT = 200;
/** 移動時間（片道）の上限（分） */
export const MAX_TRAVEL_MIN = 300;

export type SlotOfficiant = { id: string; name: string; roleTitle: string };

export type MemorialSlot = {
  /** "YYYY-MM-DD" */
  date: string;
  /** 法要の始まりと終わり */
  start: Date;
  end: Date;
  /** 押さえる時間（お寺: 前後の準備と片付けを含む。自宅・墓前: 移動時間を含む） */
  hold: Interval;
  /** この時間に空いている担当者（表示順） */
  officiants: SlotOfficiant[];
  /** 故人の祥月命日より前（当日を含む）か。故人を指定しなければ null */
  beforeMeinichi: boolean | null;
};

export type FindMemorialSlotsInput = {
  /** 希望の時期（"YYYY-MM-DD"。両端を含む）。1 つ以上 */
  periods: { from: string; to: string }[];
  location: MemorialLocation;
  /** 担当者を指定するとき（法要の担当者 is_officiant のスタッフ）。省略するとすべての担当者 */
  officiantStaffIds?: string[] | null;
  /** 供養する故人（祥月命日より前の日を先に並べるため） */
  targetPersonIds?: string[] | null;
  /** 自宅・墓前のときの行きと帰りの移動時間（分）。自宅・墓前では必須 */
  travelBeforeMin?: number | null;
  travelAfterMin?: number | null;
  /** 法要の長さ（分）。省略するとお寺の設定 */
  durationMin?: number | null;
  /** これより前の開始時刻は出さない（省略すると今） */
  now?: Date;
  limit?: number;
};

export type FindMemorialSlotsResult = {
  slots: MemorialSlot[];
  /** 上限で切ったか */
  truncated: boolean;
  /** 上限で切る前の件数 */
  total: number;
  location: MemorialLocation;
  durationMin: number;
  bufferMin: number;
  travelBeforeMin: number | null;
  travelAfterMin: number | null;
  /** 調べた担当者 */
  officiants: SlotOfficiant[];
  /** 故人の祥月命日（調べた年ごと） */
  meinichi: { personId: string; name: string; relation: string | null; deathDate: string; year: number; meinichi: string }[];
  /** 調べた日（重なりを除いて日付の順） */
  dates: string[];
};

/** 移動時間（片道。分）を検証する */
export function checkTravel(v: number | null | undefined, label: string): number {
  if (v === null || v === undefined) {
    throw invalid(`自宅・墓前の法要では、${label}の移動時間（分）が必要です。住職に尋ねて指定してください`);
  }
  if (!Number.isInteger(v) || v < 0 || v > MAX_TRAVEL_MIN) {
    throw invalid(`${label}の移動時間は 0〜${MAX_TRAVEL_MIN} 分の整数で指定してください`);
  }
  return v;
}

export function checkDuration(v: number | null | undefined, settings: TempleSettings): number {
  if (v === null || v === undefined) return settings.memorialDurationMin;
  if (!Number.isInteger(v) || v < 10 || v > 240) throw invalid("法要の長さは 10〜240 分の整数で指定してください");
  return v;
}

/** 押さえる時間。お寺は前後の準備と片付け、自宅・墓前は行きと帰りの移動時間を足す */
export function holdInterval(
  location: MemorialLocation,
  start: Date,
  durationMin: number,
  bufferMin: number,
  travelBeforeMin: number | null,
  travelAfterMin: number | null,
): Interval {
  const end = addMinutes(start, durationMin);
  if (location === "temple") return { start: addMinutes(start, -bufferMin), end: addMinutes(end, bufferMin) };
  return { start: addMinutes(start, -(travelBeforeMin ?? 0)), end: addMinutes(end, travelAfterMin ?? 0) };
}

/** お寺の設定から、1 日の開始時刻（"HH:MM"）の一覧を作る */
export function slotStartTimes(settings: TempleSettings): string[] {
  const first = parseHHMM(settings.slotFirstStart);
  const last = parseHHMM(settings.slotLastStart);
  const step = Math.max(5, settings.slotStepMin);
  const out: string[] = [];
  for (let m = first; m <= last; m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/** 担当者を検証する。指定がなければ、すべての法要の担当者 */
export async function resolveOfficiants(
  templeId: string,
  ids: string[] | null | undefined,
  conn: DbOrTx = db,
): Promise<Staff[]> {
  const all = await listOfficiants(templeId, conn);
  if (!ids || ids.length === 0) return all;
  return [...new Set(ids)].map((id) => {
    const s = all.find((o) => o.id === id);
    if (!s) {
      throw invalid(`法要の担当者にできるのは、${all.map((o) => `${o.roleTitle} ${o.name}`).join("、")} です`);
    }
    return s;
  });
}

/**
 * 希望の時期の中で、担当者が空いていて、お寺のときは本堂も空いている開始時刻を列挙する。
 * 並びは「祥月命日より前（当日を含む）の日」→「命日より後の日」、それぞれ日時の順。
 * 担当者を指定しないときは、開始時刻ごとに空いている担当者をすべて並べる（docs/tasks/04-memorial.md【決定】）
 */
export async function findMemorialSlots(
  actor: Actor,
  input: FindMemorialSlotsInput,
  conn: DbOrTx = db,
): Promise<FindMemorialSlotsResult> {
  assertStaff(actor);
  if (!isMemorialLocation(input.location)) throw invalid("場所は temple（お寺）、home（自宅）、grave（墓前）のどれかにしてください");
  if (!Array.isArray(input.periods) || input.periods.length === 0) throw invalid("希望の時期を 1 つ以上指定してください");
  const dateSet = new Set<string>();
  for (const p of input.periods) {
    checkDate(p.from, "期間の始まり");
    checkDate(p.to, "期間の終わり");
    if (p.from > p.to) throw invalid("期間の終わりは、始まりと同じか後の日にしてください");
    if (eachDate(p.from, p.to).length > MAX_SLOT_DAYS) throw invalid(`一度に調べられるのは ${MAX_SLOT_DAYS} 日までです。期間を分けてください`);
    for (const d of eachDate(p.from, p.to)) dateSet.add(d);
  }
  const dates = [...dateSet].sort();
  if (dates.length > MAX_SLOT_DAYS) throw invalid(`一度に調べられるのは ${MAX_SLOT_DAYS} 日までです。期間を分けてください`);

  const temple = await getTemple(actor.templeId, conn);
  const settings = temple.settings;
  const durationMin = checkDuration(input.durationMin, settings);
  const travelBeforeMin = input.location === "temple" ? null : checkTravel(input.travelBeforeMin, "行き");
  const travelAfterMin = input.location === "temple" ? null : checkTravel(input.travelAfterMin, "帰り");
  const officiants = await resolveOfficiants(actor.templeId, input.officiantStaffIds, conn);
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_SLOT_LIMIT, 500));
  const now = input.now ?? new Date();

  // 祥月命日（年ごと）
  const targets = [...(await personsByIds(input.targetPersonIds ?? [], conn)).values()].filter(
    (p) => p.templeId === actor.templeId && p.isDeceased && p.deathDate,
  );
  const years = [...new Set(dates.map((d) => parseDateString(d).year))];
  const meinichi = years.flatMap((year) =>
    targets.map((p) => ({
      personId: p.id,
      name: fullName(p),
      relation: p.relation,
      deathDate: p.deathDate!,
      year,
      meinichi: shoutsukiMeinichi(p.deathDate!, year),
    })),
  );
  const earliestMeinichi = new Map<number, string>();
  for (const m of meinichi) {
    const cur = earliestMeinichi.get(m.year);
    if (!cur || m.meinichi < cur) earliestMeinichi.set(m.year, m.meinichi);
  }

  // 埋まっている時間（前後に 1 日の余裕を持たせて読む）
  const range = { from: jst(addDays(dates[0], -1)), to: jst(addDays(dates[dates.length - 1], 2)) };
  const busy = await getStaffBusyIntervals(
    officiants.map((o) => o.id),
    range,
    conn,
  );
  const hallBusy =
    input.location === "temple" ? await getFacilityBusyIntervals(await getMainHallId(actor.templeId, conn), range, conn) : [];

  const times = slotStartTimes(settings);
  const all: MemorialSlot[] = [];
  for (const date of dates) {
    const m = earliestMeinichi.get(parseDateString(date).year);
    for (const time of times) {
      const start = jst(date, time);
      if (start.getTime() < now.getTime()) continue;
      const hold = holdInterval(input.location, start, durationMin, settings.bufferMin, travelBeforeMin, travelAfterMin);
      if (input.location === "temple" && !isFree(hold, hallBusy)) continue;
      const free = officiants.filter((o) => isFree(hold, busy[o.id] ?? []));
      if (free.length === 0) continue;
      all.push({
        date,
        start,
        end: addMinutes(start, durationMin),
        hold,
        officiants: free.map((o) => ({ id: o.id, name: o.name, roleTitle: o.roleTitle })),
        beforeMeinichi: m ? date <= m : null,
      });
    }
  }
  // 命日より前の日を先に（同じ側の中は日時の順。sort は安定）
  all.sort((a, b) => Number(a.beforeMeinichi === false) - Number(b.beforeMeinichi === false));

  return {
    slots: all.slice(0, limit),
    truncated: all.length > limit,
    total: all.length,
    location: input.location,
    durationMin,
    bufferMin: settings.bufferMin,
    travelBeforeMin,
    travelAfterMin,
    officiants: officiants.map((o) => ({ id: o.id, name: o.name, roleTitle: o.roleTitle })),
    meinichi,
    dates,
  };
}
