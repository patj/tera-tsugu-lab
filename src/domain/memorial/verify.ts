// 年忌の検証（verify_memorial。spec.md §3 の 4 つのチェック）
// 1. 故人の取り違え: 候補が複数なら、法号と没年を並べて返す（自動で 1 人に決めない）
// 2. 回忌と年の対応: 希望の年が何回忌かを計算し、依頼された回忌と食い違えば指摘する
// 3. 命日より後の日: 希望日がその年の祥月命日より後なら警告する（受け付けはする。§12 E-1）
// 4. 複数霊位供養の提案: 同じ世帯に、同じ年に年忌を迎える故人がほかにいれば提案する
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { persons } from "@/db/schema";
import { getTemple, invalid, parseDateString, todayJst, type Actor, type SectPreset } from "@/domain/core";
import {
  HOUSEHOLD_STATUS_LABELS,
  isMemorialKaiki,
  kaikiName,
  kaikiOfYear,
  memorialInYear,
  nextMemorial,
  searchDeceased,
  shoutsukiMeinichi,
  yearOfKaiki,
} from "@/domain/ledger";
import {
  assertStaff,
  checkDate,
  checkKaiki,
  fullName,
  personsByIds,
  requireHousehold,
  requirePerson,
  type PersonRow,
} from "./common";
import { JOINT_SERVICE_LABEL } from "./types";

export type VerifyMemorialInput = {
  /** 故人が決まっているとき */
  personId?: string | null;
  /** 故人を探すとき: 俗名（姓・名・カナの一部）、続柄（世帯主から見た関係。例: 父）、法号、世帯 */
  name?: string | null;
  relation?: string | null;
  homyo?: string | null;
  householdId?: string | null;
  /** 依頼された回忌（一周忌は 2） */
  kaiki?: number | null;
  /** 希望の年 */
  year?: number | null;
  /** 希望日（"YYYY-MM-DD"） */
  date?: string | null;
  /** 希望の時期（"YYYY-MM-DD"。両端を含む） */
  period?: { from: string; to: string } | null;
  /** 今日（"YYYY-MM-DD"。省略すると今日） */
  today?: string;
};

export type JointCandidate = {
  personId: string;
  name: string;
  homyo: string | null;
  relation: string | null;
  kaiki: number;
  kaikiName: string;
  meinichi: string;
};

export type VerifyCandidate = {
  personId: string;
  name: string;
  homyo: string | null;
  relation: string | null;
  deathDate: string | null;
  deathYear: number | null;
  household: { id: string; name: string; address: string | null; statusLabel: string };
  /** 希望の年（わからなければ依頼の回忌の年） */
  year: number | null;
  /** その年が何回忌か */
  kaikiInYear: number | null;
  kaikiNameInYear: string | null;
  /** その年が年忌（宗派の年忌の一覧に入る回忌）か */
  isMemorialYear: boolean;
  /** 依頼の回忌と合うか（依頼の回忌がなければ null） */
  matchesRequestedKaiki: boolean | null;
};

export type CheckResult = { ok: boolean; message: string };

export type VerifyMemorialResult =
  | { status: "not_found"; message: string }
  | { status: "needs_identification"; message: string; candidates: VerifyCandidate[] }
  | {
      status: "verified";
      person: VerifyCandidate;
      year: number;
      kaiki: number;
      kaikiName: string;
      /** その年の祥月命日（"YYYY-MM-DD"） */
      meinichi: string;
      checks: {
        identity: CheckResult;
        kaiki: CheckResult & { requested: number | null; actual: number; requestedYear: number | null; isMemorialKaiki: boolean };
        meinichi: CheckResult & { afterMeinichi: boolean };
        joint: CheckResult & { candidates: JointCandidate[] };
      };
      /** 注意（住職に伝えること）。なければ空 */
      warnings: string[];
    };

const md = (date: string) => {
  const { month, day } = parseDateString(date);
  return `${month}/${day}`;
};

const statusLabelOf = (s: string) => (HOUSEHOLD_STATUS_LABELS as Record<string, string>)[s] ?? s;

function deathYear(p: { deathDate: string | null }): number | null {
  return p.deathDate ? parseDateString(p.deathDate).year : null;
}

/** 希望の年を決める: 希望日 → 希望の時期 → 年 → 依頼の回忌 → 次の年忌 */
function decideYear(
  p: { deathDate: string | null },
  input: VerifyMemorialInput,
  today: string,
  preset: SectPreset,
): number | null {
  if (input.date) return parseDateString(input.date).year;
  if (input.period) return parseDateString(input.period.from).year;
  if (input.year) return input.year;
  if (!p.deathDate) return null;
  if (input.kaiki) return yearOfKaiki(p.deathDate, input.kaiki);
  return nextMemorial(p.deathDate, today, preset)?.year ?? null;
}

function candidateOf(
  p: PersonRow,
  household: { id: string; name: string; address: string | null; statusLabel: string },
  input: VerifyMemorialInput,
  today: string,
  preset: SectPreset,
): VerifyCandidate {
  const year = decideYear(p, input, today, preset);
  const k = year !== null && p.deathDate ? kaikiOfYear(p.deathDate, year) : null;
  return {
    personId: p.id,
    name: fullName(p),
    homyo: p.homyo,
    relation: p.relation,
    deathDate: p.deathDate,
    deathYear: deathYear(p),
    household,
    year,
    kaikiInYear: k !== null && k >= 1 ? k : null,
    kaikiNameInYear: k !== null && k >= 1 ? kaikiName(k, preset) : null,
    isMemorialYear: k !== null && k >= 1 && isMemorialKaiki(k, preset),
    matchesRequestedKaiki: input.kaiki ? k === input.kaiki : null,
  };
}

function checkInput(input: VerifyMemorialInput): void {
  if (input.kaiki !== null && input.kaiki !== undefined) checkKaiki(input.kaiki);
  if (input.date) checkDate(input.date, "希望日");
  if (input.period) {
    checkDate(input.period.from, "希望の時期の始まり");
    checkDate(input.period.to, "希望の時期の終わり");
    if (input.period.from > input.period.to) throw invalid("希望の時期の終わりは、始まりと同じか後の日にしてください");
  }
  if (input.year !== null && input.year !== undefined && (!Number.isInteger(input.year) || input.year < 1900 || input.year > 2200)) {
    throw invalid(`年が正しくありません: ${input.year}`);
  }
}

/** 年忌の検証（spec.md §3 の 4 つのチェック）。スタッフだけ */
export async function verifyMemorial(
  actor: Actor,
  input: VerifyMemorialInput,
  conn: DbOrTx = db,
): Promise<VerifyMemorialResult> {
  assertStaff(actor);
  checkInput(input);
  const today = input.today ?? todayJst();
  const preset = (await getTemple(actor.templeId, conn)).preset;

  // ---- 1. 故人の取り違え ----
  let person: PersonRow;
  let household: { id: string; name: string; address: string | null; statusLabel: string };
  let identityMessage: string;
  if (input.personId) {
    person = await requirePerson(actor.templeId, input.personId, conn);
    if (!person.isDeceased || !person.deathDate) throw invalid(`${fullName(person)}さんは故人として登録されていません`);
    const h = await requireHousehold(actor.templeId, person.householdId, conn);
    household = { id: h.id, name: h.name, address: h.address, statusLabel: statusLabelOf(h.status) };
    identityMessage = `${household.name}の${person.relation ?? ""} ${fullName(person)}（${person.homyo ?? "法号なし"}、${person.deathDate} 没）として確認します`;
  } else {
    if (!input.name?.trim() && !input.relation?.trim() && !input.homyo?.trim() && !input.householdId) {
      throw invalid("故人を決めるために、person_id か、俗名・続柄・法号・世帯のどれかを指定してください");
    }
    const found = await searchDeceased(
      actor,
      {
        name: input.name ?? undefined,
        relation: input.relation ?? undefined,
        homyo: input.homyo ?? undefined,
        householdId: input.householdId ?? undefined,
        limit: 20,
        today,
      },
      conn,
    );
    if (found.length === 0) {
      return { status: "not_found", message: "当てはまる故人が見つかりません。俗名の一部や世帯を変えて探してください" };
    }
    if (found.length > 1) {
      const byId = await personsByIds(found.map((c) => c.personId), conn);
      const candidates = found.map((c) =>
        candidateOf(
          byId.get(c.personId)!,
          { id: c.household.id, name: c.household.name, address: c.household.address, statusLabel: c.household.statusLabel },
          input,
          today,
          preset,
        ),
      );
      return {
        status: "needs_identification",
        message:
          `当てはまる故人が ${candidates.length} 人います。自動では 1 人に決めません。` +
          "法号・没年・世帯（住所）を住職に伝えて、どの方かを確かめてください",
        candidates,
      };
    }
    const c = found[0];
    person = await requirePerson(actor.templeId, c.personId, conn);
    household = { id: c.household.id, name: c.household.name, address: c.household.address, statusLabel: c.household.statusLabel };
    identityMessage = `当てはまる故人は 1 人です: ${household.name}の${person.relation ?? ""} ${fullName(person)}（${person.homyo ?? "法号なし"}、${person.deathDate} 没）。念のため法号を住職と確かめてください`;
  }

  const deathDate = person.deathDate!;
  const cand = candidateOf(person, household, input, today, preset);
  const year = cand.year;
  if (year === null) throw invalid("年忌の年を決められません。希望の時期か回忌を指定してください");
  const warnings: string[] = [];

  // ---- 2. 回忌と年の対応 ----
  const actual = kaikiOfYear(deathDate, year);
  if (actual < 1) throw invalid(`${year} 年は、${fullName(person)}さんが亡くなる前の年です（${deathDate} 没）`);
  const actualName = kaikiName(actual, preset);
  const requested = input.kaiki ?? null;
  const requestedYear = requested ? yearOfKaiki(deathDate, requested) : null;
  const memorialKaiki = isMemorialKaiki(actual, preset);
  let kaikiOk = true;
  let kaikiMessage: string;
  if (requested && requested !== actual) {
    kaikiOk = false;
    kaikiMessage =
      `依頼は${kaikiName(requested, preset)}ですが、${year} 年は${actualName}にあたります（${deathYear(person)} 年没。亡くなった年を 1 回忌と数える）。` +
      `${kaikiName(requested, preset)}は ${requestedYear} 年です`;
    warnings.push(kaikiMessage);
  } else {
    kaikiMessage = `${year} 年は${actualName}です（${deathYear(person)} 年没）${requested ? "。依頼どおりです" : ""}`;
  }
  if (!memorialKaiki) {
    kaikiOk = false;
    const list = preset.kaikiList.map((k) => kaikiName(k, preset)).join("、");
    const msg = `${year} 年の${actualName}は、年忌法要を営む回忌ではありません（年忌: ${list}）`;
    kaikiMessage += `。${msg}`;
    warnings.push(msg);
  }

  // ---- 3. 命日より後の日 ----
  const meinichi = shoutsukiMeinichi(deathDate, year);
  let afterMeinichi = false;
  let meinichiMessage: string;
  if (input.date) {
    afterMeinichi = input.date > meinichi;
    meinichiMessage = afterMeinichi
      ? `希望日 ${md(input.date)} は、祥月命日（${md(meinichi)}）より後です。法要は命日より前に繰り上げるのが一般的です（受け付けはできます）`
      : `希望日 ${md(input.date)} は、祥月命日（${md(meinichi)}）より前です`;
  } else if (input.period) {
    if (input.period.from > meinichi) {
      afterMeinichi = true;
      meinichiMessage = `希望の時期（${md(input.period.from)}〜${md(input.period.to)}）は、すべて祥月命日（${md(meinichi)}）より後です。法要は命日より前に繰り上げるのが一般的です（受け付けはできます）`;
    } else if (input.period.to > meinichi) {
      meinichiMessage = `祥月命日は ${md(meinichi)} です。希望の時期のうち ${md(meinichi)} より後の日は命日を過ぎるので、${md(input.period.from)}〜${md(meinichi)} の日を勧めるのが一般的です（find_memorial_slots は命日より前の日を先に並べます）`;
    } else {
      meinichiMessage = `希望の時期は、祥月命日（${md(meinichi)}）より前です`;
    }
  } else {
    meinichiMessage = `${year} 年の祥月命日は ${md(meinichi)} です。この日より前の日を選ぶのが一般的です`;
  }
  if (afterMeinichi) warnings.push(meinichiMessage);

  // ---- 4. 複数霊位供養の提案 ----
  const others = await conn
    .select()
    .from(persons)
    .where(and(eq(persons.householdId, person.householdId), eq(persons.isDeceased, true)));
  const joint: JointCandidate[] = others
    .filter((o) => o.id !== person.id && o.deathDate)
    .flatMap((o) => {
      const m = memorialInYear(o.deathDate!, year, preset);
      return m
        ? [{ personId: o.id, name: fullName(o), homyo: o.homyo, relation: o.relation, kaiki: m.kaiki, kaikiName: m.kaikiName, meinichi: m.meinichi }]
        : [];
    })
    .sort((a, b) => a.meinichi.localeCompare(b.meinichi));
  const jointMessage =
    joint.length > 0
      ? `同じ世帯に、${year} 年に年忌を迎える故人がほかにいます: ` +
        joint.map((j) => `${j.relation ?? ""} ${j.name}（${j.homyo ?? "法号なし"}）の${j.kaikiName}（祥月命日 ${md(j.meinichi)}）`).join("、") +
        `。あわせて営む（${JOINT_SERVICE_LABEL}）ことを提案できます`
      : `同じ世帯に、${year} 年に年忌を迎えるほかの故人はいません`;

  return {
    status: "verified",
    person: cand,
    year,
    kaiki: actual,
    kaikiName: actualName,
    meinichi,
    checks: {
      identity: { ok: true, message: identityMessage },
      kaiki: { ok: kaikiOk, message: kaikiMessage, requested, actual, requestedYear, isMemorialKaiki: memorialKaiki },
      meinichi: { ok: !afterMeinichi, message: meinichiMessage, afterMeinichi },
      joint: { ok: true, message: jointMessage, candidates: joint },
    },
    warnings,
  };
}

/** 確定のときの注意（回忌の食い違い、命日より後の日）。プレビューと管理画面で使う */
export function bookingWarnings(
  targets: { name: string; deathDate: string | null; kaiki: number }[],
  date: string,
  preset: SectPreset,
): string[] {
  const year = parseDateString(date).year;
  const out: string[] = [];
  for (const t of targets) {
    if (!t.deathDate) continue;
    const actual = kaikiOfYear(t.deathDate, year);
    if (actual !== t.kaiki) {
      out.push(
        `${t.name}さんの${kaikiName(t.kaiki, preset)}は ${yearOfKaiki(t.deathDate, t.kaiki)} 年です（${year} 年は${actual >= 1 ? kaikiName(actual, preset) : "没年より前"}）`,
      );
    }
    const meinichi = shoutsukiMeinichi(t.deathDate, year);
    if (date > meinichi) out.push(`${md(date)} は、${t.name}さんの祥月命日（${md(meinichi)}）より後です（受け付けはできます）`);
  }
  return out;
}
