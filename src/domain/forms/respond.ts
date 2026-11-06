// 回答する側: 入口ごとの設問の出し分け、person_list の自動入力、回答の検証と保存、自分や世帯の申し込みの確認
// （公開フォーム /f/[formId] と、06 の檀家ポータルから使う）
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { formResponses, forms } from "@/db/schema";
import {
  conflict,
  forbidden,
  formatJst,
  getDefaultTempleId,
  invalid,
  notFound,
  writeAuditLog,
  type Actor,
} from "@/domain/core";
import { findFormRow, inTx, isUuid, listQuestions, toForm } from "./forms";
import { formatAnswers, personEntries, entryDisplayName } from "./format";
import { SOURCE_LABELS } from "./labels";
import {
  getHouseholdMembers,
  getHouseholdProfile,
  getPersonProfile,
  type LedgerHousehold,
  type LedgerMember,
} from "./ledger-adapter";
import type {
  Answers,
  Form,
  FormMode,
  FormQuestion,
  FormStatus,
  ItemFieldType,
  PersonEntry,
  PersonListItemField,
  ProfileField,
  ResponseSource,
} from "./types";

export const MAX_SHORT = 200;
export const MAX_LONG = 2000;
export const MAX_NUMBER = 1_000_000;

// ---- 入口と公開範囲 ----

/** 公開範囲と入口が合うか（public は共通リンクだけ、members は個別リンクとポータルだけ、both はすべて） */
export function modeAccepts(mode: FormMode, source: ResponseSource): boolean {
  if (mode === "both") return true;
  if (mode === "public") return source === "public";
  return source !== "public";
}

export function modeMismatchMessage(mode: FormMode): string {
  return mode === "members"
    ? "このフォームは檀家の方専用です。お寺からお届けした個別のリンク（または檀家ポータル）から回答してください。"
    : "このフォームは個別のリンクでは受け付けていません。共通のリンクから回答してください。";
}

export const CLOSED_MESSAGE = "このフォームの受付は締め切りました。";

/** 入口ごとに表示する設問か（個別リンクとポータルでは、台帳で補える設問を隠す） */
export function isQuestionVisible(q: Pick<FormQuestion, "profileField">, source: ResponseSource): boolean {
  return source === "public" || !q.profileField;
}

/** 回答の操作者（ログインしない公開フォームから答える人） */
export function publicRespondentActor(templeId: string): Actor {
  return { templeId, channel: "web", label: "public:公開フォーム" };
}

// ---- 台帳の値 ----

const GENDER_WORD: Record<string, string> = { male: "男", female: "女" };

/** 台帳の性別（male / female）を、項目の選択肢（「男」「女」「男性」など）に合わせる */
export function genderValue(gender: string | null, options?: string[] | null): string | null {
  const word = gender ? GENDER_WORD[gender] : undefined;
  if (!word) return null;
  return options?.find((o) => o.includes(word)) ?? word;
}

/** 個人の台帳の値（person_list の項目、または台帳で補う設問） */
export function personLedgerValue(
  member: LedgerMember | null,
  profileField: ProfileField,
  options?: string[] | null,
): string | null {
  if (!member) return null;
  switch (profileField) {
    case "name":
      return member.name;
    case "kana":
      return member.kana;
    case "birth_date":
      return member.birthDate;
    case "gender":
      return genderValue(member.gender, options);
    case "email":
      return member.email;
    case "phone":
      return member.mobilePhone;
    default:
      return null;
  }
}

/** 家族を選んだときに、person_list の項目に入る値（台帳にある項目だけ） */
export function memberItemValues(member: LedgerMember, fields: PersonListItemField[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) {
    if (!f.profileField) continue;
    const v = personLedgerValue(member, f.profileField, f.options);
    if (v) values[f.key] = v;
  }
  return values;
}

// ---- 回答の画面に出すフォーム ----

export type RespondentContext = { source: ResponseSource; householdId?: string | null; personId?: string | null };

export type RespondentItemField = PersonListItemField & {
  /** 家族を選ぶと台帳から入る項目（個別リンクとポータルのとき） */
  autoFill: boolean;
};

export type FamilyCandidate = {
  personId: string;
  name: string;
  /** 選んだときに入る値（項目のキー → 値）。台帳にない項目は入らない */
  values: Record<string, string>;
};

export type RespondentQuestion = {
  id: string;
  type: FormQuestion["type"];
  label: string;
  description: string | null;
  required: boolean;
  options: string[] | null;
  maxPersons: number | null;
  itemFields: RespondentItemField[] | null;
  /** person_list で選べる家族（世帯がわかるときだけ） */
  candidates: FamilyCandidate[];
};

export type Availability = "ok" | "closed" | "mode_mismatch";

export type RespondentForm = {
  id: string;
  templeId: string;
  title: string;
  description: string | null;
  mode: FormMode;
  status: FormStatus;
  source: ResponseSource;
  /** ok なら回答できる。それ以外は notice を表示する */
  availability: Availability;
  notice: string | null;
  household: { id: string; name: string } | null;
  questions: RespondentQuestion[];
};

async function requireHousehold(form: Form, householdId: string, conn: DbOrTx): Promise<LedgerHousehold> {
  const h = isUuid(householdId) ? await getHouseholdProfile(householdId, conn) : null;
  if (!h || h.templeId !== form.templeId) throw notFound("世帯が見つかりません");
  return h;
}

/**
 * 回答の入口に合わせたフォーム。共通リンク（public）は全項目、個別リンク（member_link）とポータル（portal）は
 * 台帳で補える設問（profile_field）を隠し、person_list に家族の候補をつける。
 * フォームがない、または下書きのときは null。締め切りや入口違いは availability と notice で返す。
 */
export async function getFormForRespondent(
  formId: string,
  ctx: RespondentContext,
  conn: DbOrTx = db,
): Promise<RespondentForm | null> {
  const form = await findFormRow(formId, conn);
  if (!form || form.status === "draft") return null;

  const memberSource = ctx.source !== "public";
  let household: LedgerHousehold | null = null;
  let members: LedgerMember[] = [];
  if (memberSource && ctx.householdId) {
    household = await requireHousehold(form, ctx.householdId, conn);
    members = await getHouseholdMembers(household.id, conn);
  }

  let availability: Availability = "ok";
  let notice: string | null = null;
  if (!modeAccepts(form.mode, ctx.source)) {
    availability = "mode_mismatch";
    notice = modeMismatchMessage(form.mode);
  } else if (form.status === "closed") {
    availability = "closed";
    notice = CLOSED_MESSAGE;
  }

  const questions = (await listQuestions(form.id, conn))
    .filter((q) => isQuestionVisible(q, ctx.source))
    .map<RespondentQuestion>((q) => {
      const fields = q.itemFields ?? [];
      return {
        id: q.id,
        type: q.type,
        label: q.label,
        description: q.description,
        required: q.required,
        options: q.options,
        maxPersons: q.maxPersons,
        itemFields:
          q.type === "person_list" ? fields.map((f) => ({ ...f, autoFill: memberSource && Boolean(f.profileField) })) : null,
        candidates:
          q.type === "person_list"
            ? members.map((m) => ({ personId: m.id, name: m.name, values: memberItemValues(m, fields) }))
            : [],
      };
    });

  return {
    id: form.id,
    templeId: form.templeId,
    title: form.title,
    description: form.description,
    mode: form.mode,
    status: form.status,
    source: ctx.source,
    availability,
    notice,
    household: household ? { id: household.id, name: household.name } : null,
    questions,
  };
}

/** 檀家ポータルに表示するフォーム（公開範囲が members か both で、受付中のもの）。新しい順 */
export async function listOpenFormsForPortal(
  templeId?: string,
  conn: DbOrTx = db,
): Promise<Pick<Form, "id" | "title" | "description" | "mode" | "createdAt">[]> {
  const tid = templeId ?? (await getDefaultTempleId(conn));
  const rows = await conn
    .select()
    .from(forms)
    .where(and(eq(forms.templeId, tid), eq(forms.status, "open"), inArray(forms.mode, ["members", "both"])))
    .orderBy(desc(forms.createdAt));
  return rows.map(toForm).map(({ id, title, description, mode, createdAt }) => ({ id, title, description, mode, createdAt }));
}

// ---- 回答の検証 ----

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 1 つの値（記述、選択、日付、数値）を検証して文字や数にする。空なら undefined */
function scalarValue(
  type: "short" | "long" | "single" | "date" | "number",
  raw: unknown,
  options: string[] | null | undefined,
  where: string,
): string | number | undefined {
  if (isEmpty(raw)) return undefined;
  if (type === "number") {
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isInteger(n) || n < 0 || n > MAX_NUMBER) throw invalid(`${where}は 0 以上の整数で入力してください`);
    return n;
  }
  if (typeof raw !== "string") throw invalid(`${where}の値が正しくありません`);
  const s = raw.trim();
  switch (type) {
    case "short":
      if (s.length > MAX_SHORT) throw invalid(`${where}は ${MAX_SHORT} 文字までにしてください`);
      return s;
    case "long":
      if (s.length > MAX_LONG) throw invalid(`${where}は ${MAX_LONG} 文字までにしてください`);
      return s;
    case "single":
      if (!options?.includes(s)) throw invalid(`${where}は選択肢から選んでください`);
      return s;
    case "date":
      if (!isValidDate(s)) throw invalid(`${where}は日付（例: 1960-04-08）で入力してください`);
      return s;
  }
}

function q(label: string) {
  return `「${label}」`;
}

function rawEntries(raw: unknown, where: string): PersonEntry[] {
  if (isEmpty(raw)) return [];
  if (!Array.isArray(raw)) throw invalid(`${where}の値が正しくありません`);
  return raw.map((e) => {
    if (!e || typeof e !== "object") throw invalid(`${where}の値が正しくありません`);
    const obj = e as { personId?: unknown; values?: unknown };
    const values: Record<string, string> = {};
    if (obj.values && typeof obj.values === "object") {
      for (const [k, v] of Object.entries(obj.values as Record<string, unknown>)) {
        if (v !== undefined && v !== null) values[k] = typeof v === "string" ? v : String(v);
      }
    }
    const personId = typeof obj.personId === "string" && obj.personId ? obj.personId : undefined;
    return personId ? { personId, values } : { values };
  });
}

function personListValue(
  question: FormQuestion,
  raw: unknown,
  source: ResponseSource,
  members: LedgerMember[],
): PersonEntry[] | undefined {
  const fields = question.itemFields ?? [];
  const entries = rawEntries(raw, q(question.label)).filter(
    (e) => e.personId || Object.values(e.values).some((v) => v.trim() !== ""),
  );
  if (entries.length === 0) return undefined;
  const max = question.maxPersons ?? entries.length;
  if (entries.length > max) throw invalid(`${q(question.label)}は ${max} 人までです`);

  const seen = new Set<string>();
  return entries.map((entry, i) => {
    const where = `${q(question.label)}の ${i + 1} 人目`;
    let member: LedgerMember | null = null;
    if (entry.personId) {
      if (source === "public") throw invalid(`${where}: 共通のリンクからは、台帳の家族を選べません`);
      member = members.find((m) => m.id === entry.personId) ?? null;
      if (!member) throw invalid(`${where}: 選んだ方が、この世帯の家族に見つかりません`);
      if (seen.has(member.id)) throw invalid(`${where}: 同じ方が 2 回選ばれています`);
      seen.add(member.id);
    }
    const values: Record<string, string> = {};
    for (const f of fields) {
      // 家族を選んだときは、台帳にある項目を台帳の値にする（送られてきた値は使わない）
      const ledger = member && f.profileField ? personLedgerValue(member, f.profileField, f.options) : null;
      const v = scalarValue(f.type as ItemFieldType, ledger ?? entry.values[f.key], f.options, `${where}の${q(f.label)}`);
      if (v === undefined) {
        if (f.required) throw invalid(`${where}の${q(f.label)}を入力してください`);
        continue;
      }
      values[f.key] = String(v);
    }
    return member ? { personId: member.id, values } : { values };
  });
}

// ---- 回答の保存 ----

export type SubmitResponseInput = {
  source: ResponseSource;
  /** 個別リンクの世帯（トークンから引いたもの。呼ぶ側でトークンを確かめる） */
  householdId?: string | null;
  /** ポータルで回答した人（actor.personId と同じであること） */
  personId?: string | null;
  answers: Answers;
};

/**
 * 回答を検証して保存する。
 * - 共通リンク: すべての設問を検証する
 * - 個別リンクとポータル: 台帳で補える設問は聞かずに、台帳の値（世帯の住所と電話、回答者の氏名など）で埋める。
 *   person_list で家族を選んだ人は、台帳にある項目（カナ、氏名、生年月日、性別）を台帳の値にする
 */
export async function submitResponse(
  actor: Actor,
  formId: string,
  input: SubmitResponseInput,
  conn: DbOrTx = db,
): Promise<{ id: string }> {
  const form = await findFormRow(formId, conn);
  if (!form || form.status === "draft" || form.templeId !== actor.templeId) throw notFound("フォームが見つかりません");
  const source = input.source;
  if (!(["public", "member_link", "portal"] as const).includes(source)) throw invalid("回答の入口が正しくありません");
  if (!modeAccepts(form.mode, source)) throw forbidden(modeMismatchMessage(form.mode));
  if (form.status !== "open") throw conflict(CLOSED_MESSAGE);

  // 回答者と世帯
  let household: LedgerHousehold | null = null;
  let respondent: LedgerMember | null = null;
  if (source === "portal") {
    if (actor.channel !== "portal" || !actor.personId) throw forbidden("ポータルにログインしてから回答してください");
    if (input.personId && input.personId !== actor.personId) throw forbidden("ほかの方として回答することはできません");
    respondent = await getPersonProfile(actor.personId, conn);
    if (!respondent) throw notFound("回答する方が台帳に見つかりません");
    if (input.householdId && input.householdId !== respondent.householdId) {
      throw forbidden("ほかの世帯として回答することはできません");
    }
    household = await requireHousehold(form, respondent.householdId, conn);
  } else if (source === "member_link") {
    if (!input.householdId) throw invalid("個別リンクの世帯がわかりません");
    household = await requireHousehold(form, input.householdId, conn);
    const repId = household.contactPersonId ?? household.headPersonId;
    respondent = repId ? await getPersonProfile(repId, conn) : null;
  }
  const members = household ? await getHouseholdMembers(household.id, conn) : [];

  // 設問ごとの検証
  const questions = await listQuestions(form.id, conn);
  const answers: Answers = {};
  for (const question of questions) {
    const raw = input.answers?.[question.id];
    let value: unknown;
    if (!isQuestionVisible(question, source)) {
      value = profileAnswer(question, household, respondent);
    } else if (question.type === "person_list") {
      value = personListValue(question, raw, source, members);
    } else if (question.type === "multi") {
      value = multiValue(question, raw);
    } else {
      value = scalarValue(question.type, raw, question.options, q(question.label));
    }
    if (value === undefined || value === null) {
      if (question.required && isQuestionVisible(question, source)) {
        throw invalid(
          question.type === "person_list"
            ? `${q(question.label)}を 1 人以上入力してください`
            : `${q(question.label)}を入力してください`,
        );
      }
      continue;
    }
    answers[question.id] = value;
  }

  const respondentName = pickRespondentName(questions, answers) ?? respondent?.name ?? household?.name ?? null;
  const contact = pickContact(questions, answers);

  return inTx(conn, async (tx) => {
    const [row] = await tx
      .insert(formResponses)
      .values({
        templeId: form.templeId,
        formId: form.id,
        householdId: household?.id ?? null,
        personId: source === "portal" ? (respondent?.id ?? null) : null,
        respondentName,
        contact,
        answers,
        source,
      })
      .returning({ id: formResponses.id });
    await writeAuditLog(
      actor,
      { action: "forms.respond", target: `form:${form.id}`, summary: `${form.title}（${SOURCE_LABELS[source]}）`, result: "ok" },
      tx,
    );
    return { id: row.id };
  });
}

function multiValue(question: FormQuestion, raw: unknown): string[] | undefined {
  if (isEmpty(raw)) return undefined;
  const list = (Array.isArray(raw) ? raw : [raw]).map((v) => String(v).trim()).filter((v) => v !== "");
  for (const v of list) {
    if (!question.options?.includes(v)) throw invalid(`${q(question.label)}は選択肢から選んでください`);
  }
  // 選択肢の順にそろえ、重なりを除く
  const picked = (question.options ?? []).filter((o) => list.includes(o));
  return picked.length > 0 ? picked : undefined;
}

/** 隠した設問（台帳で補える項目）を、台帳の値で埋める */
function profileAnswer(
  question: FormQuestion,
  household: LedgerHousehold | null,
  respondent: LedgerMember | null,
): string | null {
  switch (question.profileField) {
    case "address":
      return household?.address ?? null;
    case "phone":
      return household?.phone ?? respondent?.mobilePhone ?? null;
    case "name":
      return respondent?.name ?? household?.name ?? null;
    case null:
      return null;
    default:
      return personLedgerValue(respondent, question.profileField, question.options);
  }
}

function pickRespondentName(questions: FormQuestion[], answers: Answers): string | null {
  const nameQ = questions.find((x) => x.profileField === "name" && typeof answers[x.id] === "string");
  if (nameQ) return answers[nameQ.id] as string;
  for (const x of questions) {
    if (x.type !== "person_list") continue;
    const first = personEntries(answers[x.id])[0];
    if (first) return entryDisplayName(x, first);
  }
  return null;
}

function pickContact(questions: FormQuestion[], answers: Answers): string | null {
  const parts = questions
    .filter((x) => (x.profileField === "phone" || x.profileField === "email") && typeof answers[x.id] === "string")
    .map((x) => answers[x.id] as string);
  return parts.length > 0 ? parts.join(" / ") : null;
}

// ---- 自分や世帯の申し込みの確認（ポータル） ----

export type MyResponse = {
  id: string;
  formId: string;
  formTitle: string;
  formStatus: FormStatus;
  source: ResponseSource;
  personId: string | null;
  respondentName: string | null;
  createdAt: Date;
  /** 日本時間の表示（例: 2026-11-05（木）10:00） */
  createdAtLabel: string;
  /** 設問の順の回答（例: { label: "祈願する方", value: "2 人: 山田 太郎、山田 花子" }） */
  items: { label: string; value: string }[];
};

async function myResponses(where: ReturnType<typeof eq>, conn: DbOrTx): Promise<MyResponse[]> {
  const rows = await conn
    .select({ r: formResponses, f: forms })
    .from(formResponses)
    .innerJoin(forms, eq(forms.id, formResponses.formId))
    .where(where)
    .orderBy(desc(formResponses.createdAt));
  const questionsByForm = new Map<string, FormQuestion[]>();
  const out: MyResponse[] = [];
  for (const { r, f } of rows) {
    let questions = questionsByForm.get(f.id);
    if (!questions) {
      questions = await listQuestions(f.id, conn);
      questionsByForm.set(f.id, questions);
    }
    out.push({
      id: r.id,
      formId: f.id,
      formTitle: f.title,
      formStatus: f.status as FormStatus,
      source: r.source as ResponseSource,
      personId: r.personId,
      respondentName: r.respondentName,
      createdAt: r.createdAt,
      createdAtLabel: formatJst(r.createdAt),
      items: formatAnswers(questions, r.answers),
    });
  }
  return out;
}

/** ポータルで本人が申し込んだ回答。権限の確認は呼ぶ側（ポータル）で行う */
export async function listResponsesOfPerson(personId: string, conn: DbOrTx = db): Promise<MyResponse[]> {
  if (!isUuid(personId)) return [];
  return myResponses(eq(formResponses.personId, personId), conn);
}

/** 世帯にひもづく回答（個別リンクとポータル）。権限の確認は呼ぶ側（ポータル）で行う */
export async function listResponsesOfHousehold(householdId: string, conn: DbOrTx = db): Promise<MyResponse[]> {
  if (!isUuid(householdId)) return [];
  return myResponses(eq(formResponses.householdId, householdId), conn);
}
