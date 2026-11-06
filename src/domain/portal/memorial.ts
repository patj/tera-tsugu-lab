// 法要の申し込み（spec.md §3.1）と申し込みの状況。04 の関数は memorial-adapter.ts を通して呼ぶ
// - 申し込めるのは、窓口と、can_apply_memorial の家族
// - 申し込みの状況: 窓口と can_view_household の家族は世帯のすべて、それ以外の家族は自分で申し込んだものだけ
// - 入力の検証はここで行う（04 の関数に置き換えても、ポータルの判定が残るように）
import { db, type DbOrTx } from "@/db/client";
import { addDays, getTemple, invalid, parseDateString, todayJst, type Actor } from "@/domain/core";
import { getHousehold, getHouseholdMembers, kaikiName } from "@/domain/ledger";
import { getPortalContext, requireApplyMemorial } from "./access";
import {
  createMemorialRequest,
  listMemorialRequestsForHousehold,
  suggestKaiki,
  type HouseholdMemorialRequest,
  type MemorialLocation,
} from "./memorial-adapter";

export const MEMORIAL_LOCATIONS: MemorialLocation[] = ["temple", "home", "grave"];
/** 申し込みフォームで選べる年（今年から何年先まで） */
export const APPLY_YEARS_AHEAD = 4;
const MAX_KAIKI = 100;
const MAX_ATTENDEES = 200;
const MAX_NOTES = 1000;
const MAX_PERIOD_NOTE = 100;
const MAX_SESHU_NAME = 50;
/** 1 つの希望の時期の長さの上限（日） */
const MAX_PERIOD_DAYS = 92;

export type PortalMemorialRequest = HouseholdMemorialRequest & {
  /** 自分が申し込んだものか */
  mine: boolean;
};

/** 申し込みの状況（新しい順）。窓口と can_view_household の家族は世帯のすべて、それ以外は自分の申し込みだけ */
export async function listPortalMemorialRequests(actor: Actor, conn: DbOrTx = db): Promise<PortalMemorialRequest[]> {
  const ctx = await getPortalContext(actor, conn);
  const all = await listMemorialRequestsForHousehold(ctx.household.id);
  return all
    .filter((r) => ctx.can.viewHousehold || r.requestedByPersonId === ctx.person.id)
    .map((r) => ({ ...r, mine: r.requestedByPersonId === ctx.person.id }));
}

export type KaikiSuggestion = { kaiki: number; kaikiName: string; isMemorialKaiki: boolean };

export type MemorialApplyOptions = {
  householdName: string;
  selfPersonId: string;
  /** 自分の家の故人（没年月日の新しい順） */
  deceased: {
    id: string;
    name: string;
    homyo: string | null;
    relation: string | null;
    deathDate: string | null;
    nextMemorial: { year: number; kaiki: number; kaikiName: string; meinichi: string } | null;
    /** 年 → 提案する回忌（亡くなった年より前の年は入らない） */
    suggestions: Record<number, KaikiSuggestion>;
  }[];
  /** 施主に選べる家族（生きている人。本人を先頭に） */
  family: { id: string; name: string; relation: string | null; isSelf: boolean }[];
  /** 選べる年 */
  years: number[];
  /** 年の初期値（いちばん近い年忌の年） */
  defaultYear: number;
  /** 回忌の選択肢（宗派の年忌の一覧） */
  kaikiChoices: { kaiki: number; kaikiName: string }[];
  /** 希望の時期に入れられる最初の日（明日） */
  minDate: string;
};

/** 申し込みフォームに出す選択肢（故人、施主の候補、回忌の提案） */
export async function getMemorialApplyOptions(
  actor: Actor,
  opts: { today?: string } = {},
  conn: DbOrTx = db,
): Promise<MemorialApplyOptions> {
  const ctx = await requireApplyMemorial(actor, conn);
  const today = opts.today ?? todayJst();
  const thisYear = parseDateString(today).year;
  const years = Array.from({ length: APPLY_YEARS_AHEAD + 1 }, (_, i) => thisYear + i);
  const detail = await getHousehold(actor, ctx.household.id, { today, contactLogLimit: 0 }, conn);
  const preset = (await getTemple(actor.templeId, conn)).preset;

  const deceased: MemorialApplyOptions["deceased"] = [];
  for (const d of detail.deceased) {
    const suggestions: Record<number, KaikiSuggestion> = {};
    if (d.deathDate) {
      for (const y of years) {
        if (y < Number(d.deathDate.slice(0, 4))) continue;
        suggestions[y] = await suggestKaiki(d.id, y);
      }
    }
    deceased.push({
      id: d.id,
      name: d.name,
      homyo: d.homyo,
      relation: d.relation,
      deathDate: d.deathDate,
      nextMemorial: d.nextMemorial,
      suggestions,
    });
  }
  const nextYears = deceased.map((d) => d.nextMemorial?.year).filter((y): y is number => !!y && years.includes(y));
  const members = await getHouseholdMembers(ctx.household.id, conn);
  return {
    householdName: ctx.household.name,
    selfPersonId: ctx.person.id,
    deceased,
    family: members
      .map((m) => ({ id: m.id, name: m.name, relation: m.relation, isSelf: m.id === ctx.person.id }))
      .sort((a, b) => Number(b.isSelf) - Number(a.isSelf)),
    years,
    defaultYear: nextYears.length ? Math.min(...nextYears) : thisYear,
    kaikiChoices: [...preset.kaikiList].sort((a, b) => a - b).map((k) => ({ kaiki: k, kaikiName: kaikiName(k, preset) })),
    minDate: addDays(today, 1),
  };
}

export type ApplyMemorialInput = {
  /** 故人と回忌（複数なら「複数の故人をあわせて供養する」） */
  targets: { personId: string; kaiki: number }[];
  /** 施主: 家族から選ぶか、名前を入力する。どちらもなければ申し込んだ本人 */
  seshuPersonId?: string | null;
  seshuName?: string | null;
  /** 第 1〜第 3 希望（"YYYY-MM-DD"） */
  preferredPeriods: { from: string; to: string; note?: string | null }[];
  location: string;
  attendees?: number | null;
  otoki?: boolean | null;
  notes?: string | null;
};

function checkDate(s: unknown, label: string): string {
  if (typeof s !== "string" || !s.trim()) throw invalid(`${label}を入力してください`);
  try {
    parseDateString(s.trim());
  } catch {
    throw invalid(`${label}は正しい日付で入力してください`);
  }
  return s.trim();
}

/**
 * 法要を申し込む（窓口、または代理を許可された家族）。この時点では日時は確定しない（状態は「受付済み」）。
 * 世帯は操作者の本人から決める。故人は自分の家の故人、施主は自分の家の生きている人か、名前の入力
 */
export async function applyMemorial(
  actor: Actor,
  input: ApplyMemorialInput,
  opts: { today?: string } = {},
  conn: DbOrTx = db,
): Promise<{ id: string }> {
  const ctx = await requireApplyMemorial(actor, conn);
  const today = opts.today ?? todayJst();
  const detail = await getHousehold(actor, ctx.household.id, { today, contactLogLimit: 0 }, conn);

  // 故人と回忌
  const targets = Array.isArray(input.targets) ? input.targets : [];
  if (targets.length === 0) throw invalid("供養する故人を 1 人以上選んでください");
  const seen = new Set<string>();
  const cleanTargets = targets.map((t) => {
    const d = detail.deceased.find((x) => x.id === t.personId);
    if (!d) throw invalid("選んだ故人が、この家の過去帳に見つかりません");
    if (seen.has(d.id)) throw invalid(`${d.name}さんが 2 回選ばれています`);
    seen.add(d.id);
    const kaiki = Number(t.kaiki);
    if (!Number.isInteger(kaiki) || kaiki < 1 || kaiki > MAX_KAIKI) {
      throw invalid(`${d.name}さんの回忌は 1〜${MAX_KAIKI} の数で選んでください`);
    }
    return { personId: d.id, kaiki };
  });

  // 施主（初期値は申し込んだ本人）
  const seshuName = typeof input.seshuName === "string" ? input.seshuName.trim() : "";
  let seshuPersonId = typeof input.seshuPersonId === "string" ? input.seshuPersonId.trim() : "";
  if (seshuPersonId && seshuName) throw invalid("施主は、ご家族から選ぶか、お名前を入力するかのどちらかにしてください");
  if (!seshuPersonId && !seshuName) seshuPersonId = ctx.person.id;
  if (seshuPersonId && !detail.members.some((m) => m.id === seshuPersonId)) {
    throw invalid("施主は、この家のご家族から選んでください");
  }
  if (seshuName.length > MAX_SESHU_NAME) throw invalid(`施主のお名前は ${MAX_SESHU_NAME} 文字までにしてください`);

  // 希望の時期（第 1〜第 3 希望）
  const periodsIn = (Array.isArray(input.preferredPeriods) ? input.preferredPeriods : []).filter(
    (p) => p && (p.from || p.to || p.note),
  );
  if (periodsIn.length === 0) throw invalid("第 1 希望の時期を入力してください");
  if (periodsIn.length > 3) throw invalid("希望の時期は第 3 希望までです");
  const minDate = addDays(today, 1);
  const preferredPeriods = periodsIn.map((p, i) => {
    const label = `第 ${i + 1} 希望`;
    const from = checkDate(p.from, `${label}の始まりの日`);
    const to = p.to ? checkDate(p.to, `${label}の終わりの日`) : from;
    if (from > to) throw invalid(`${label}の終わりの日は、始まりの日より後にしてください`);
    if (from < minDate) throw invalid(`${label}は、明日以降の日にしてください`);
    if (to > addDays(from, MAX_PERIOD_DAYS)) throw invalid(`${label}の期間は 3 か月以内にしてください`);
    const note = typeof p.note === "string" ? p.note.trim() : "";
    if (note.length > MAX_PERIOD_NOTE) throw invalid(`${label}の補足は ${MAX_PERIOD_NOTE} 文字までにしてください`);
    return note ? { from, to, note } : { from, to };
  });

  // 場所、人数、お斎、連絡事項
  if (!MEMORIAL_LOCATIONS.includes(input.location as MemorialLocation)) throw invalid("場所を選んでください");
  let attendees: number | null = null;
  if (input.attendees !== null && input.attendees !== undefined && String(input.attendees).trim() !== "") {
    attendees = Number(input.attendees);
    if (!Number.isInteger(attendees) || attendees < 1 || attendees > MAX_ATTENDEES) {
      throw invalid(`参列の人数は 1〜${MAX_ATTENDEES} 人で入力してください`);
    }
  }
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > MAX_NOTES) throw invalid(`連絡事項は ${MAX_NOTES} 文字までにしてください`);

  // 04 の関数は conn を受け取らない（統合で置き換えるため、約束した形のまま呼ぶ）
  return createMemorialRequest(actor, {
    householdId: ctx.household.id,
    targets: cleanTargets,
    seshuPersonId: seshuPersonId || null,
    seshuName: seshuPersonId ? null : seshuName,
    preferredPeriods,
    location: input.location as MemorialLocation,
    attendees,
    otoki: typeof input.otoki === "boolean" ? input.otoki : null,
    notes: notes || null,
  });
}
