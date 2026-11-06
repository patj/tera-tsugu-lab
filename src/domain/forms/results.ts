// 集計と回答の一覧（管理画面と MCP の get_form_results）。檀家 = 世帯にひもづく回答（個別リンク、ポータル）、一般 = 共通リンク
import { asc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { formResponses } from "@/db/schema";
import { formatJst, type Actor } from "@/domain/core";
import { getForm } from "./forms";
import { countPersons, formatAnswers, personEntries } from "./format";
import { respondentKindLabel } from "./labels";
import { getHouseholdNames } from "./ledger-adapter";
import type { Answers, FormQuestion, FormResponse, FormWithQuestions, QuestionType, ResponseSource } from "./types";

/** 檀家、一般、合計 */
export type Tally = { member: number; public: number; total: number };

export type QuestionResult = {
  id: string;
  label: string;
  type: QuestionType;
  /** 回答のあった件数 */
  answered: Tally;
  /** 単一選択と複数選択: 選択肢ごとの件数 */
  options?: { option: string; count: Tally }[];
  /** 数値: 合計 */
  sum?: Tally;
  /** person_list: 入力された人数 */
  persons?: Tally;
};

export type FormResults = {
  form: FormWithQuestions;
  responses: Tally;
  /** すべての person_list に入力された人数の合計 */
  persons: Tally;
  hasPersonList: boolean;
  questions: QuestionResult[];
};

const zero = (): Tally => ({ member: 0, public: 0, total: 0 });

function add(t: Tally, source: ResponseSource, n = 1) {
  if (source === "public") t.public += n;
  else t.member += n;
  t.total += n;
}

type ResponseRowDb = typeof formResponses.$inferSelect;

function toResponse(r: ResponseRowDb): FormResponse {
  return {
    id: r.id,
    formId: r.formId,
    householdId: r.householdId,
    personId: r.personId,
    respondentName: r.respondentName,
    contact: r.contact,
    answers: r.answers,
    source: r.source as ResponseSource,
    createdAt: r.createdAt,
  };
}

export async function loadResponses(formId: string, conn: DbOrTx = db): Promise<FormResponse[]> {
  const rows = await conn
    .select()
    .from(formResponses)
    .where(eq(formResponses.formId, formId))
    .orderBy(asc(formResponses.createdAt));
  return rows.map(toResponse);
}

/** 回答を集計する（DB を使わない純粋な関数。テストしやすくするため分ける） */
export function tally(questions: FormQuestion[], responses: Pick<FormResponse, "source" | "answers">[]) {
  const total = zero();
  const persons = zero();
  const results: QuestionResult[] = questions.map((q) => {
    const r: QuestionResult = { id: q.id, label: q.label, type: q.type, answered: zero() };
    if (q.type === "single" || q.type === "multi") r.options = (q.options ?? []).map((option) => ({ option, count: zero() }));
    if (q.type === "number") r.sum = zero();
    if (q.type === "person_list") r.persons = zero();
    return r;
  });
  for (const resp of responses) {
    add(total, resp.source);
    add(persons, resp.source, countPersons(questions, resp.answers));
    questions.forEach((q, i) => {
      const value = (resp.answers as Answers)[q.id];
      if (value === undefined || value === null || value === "") return;
      const r = results[i];
      add(r.answered, resp.source);
      if (r.options) {
        const picked = Array.isArray(value) ? value : [value];
        for (const o of r.options) if (picked.includes(o.option)) add(o.count, resp.source);
      }
      if (r.sum && typeof value === "number") add(r.sum, resp.source, value);
      if (r.persons) add(r.persons, resp.source, personEntries(value).length);
    });
  }
  return { responses: total, persons, questions: results };
}

/** 集計（回答の件数、選択肢ごとの件数、数値の合計、person_list の人数。それぞれ檀家、一般、合計） */
export async function getFormResults(actor: Actor, formId: string, conn: DbOrTx = db): Promise<FormResults> {
  const form = await getForm(actor, formId, conn);
  const responses = await loadResponses(form.id, conn);
  return {
    form,
    ...tally(form.questions, responses),
    hasPersonList: form.questions.some((q) => q.type === "person_list"),
  };
}

export type ResponseListRow = FormResponse & {
  kind: "檀家" | "一般";
  householdName: string | null;
  createdAtLabel: string;
  personCount: number;
  items: { label: string; value: string }[];
};

/** 回答の一覧（古い順） */
export async function listResponses(
  actor: Actor,
  formId: string,
  conn: DbOrTx = db,
): Promise<{ form: FormWithQuestions; rows: ResponseListRow[] }> {
  const form = await getForm(actor, formId, conn);
  const responses = await loadResponses(form.id, conn);
  const names = await getHouseholdNames(
    [...new Set(responses.map((r) => r.householdId).filter((x): x is string => Boolean(x)))],
    conn,
  );
  return {
    form,
    rows: responses.map((r) => ({
      ...r,
      kind: respondentKindLabel(r.source),
      householdName: r.householdId ? (names.get(r.householdId) ?? null) : null,
      createdAtLabel: formatJst(r.createdAt),
      personCount: countPersons(form.questions, r.answers),
      items: formatAnswers(form.questions, r.answers),
    })),
  };
}

/** 集計を 1 行の文にする（MCP と管理画面の見出しに使う） */
export function summarizeResults(results: Pick<FormResults, "responses" | "persons" | "hasPersonList" | "questions">): string {
  const t = results.responses;
  let s = `回答 ${t.total} 件（檀家 ${t.member} 件、一般 ${t.public} 件）`;
  if (results.hasPersonList) {
    const p = results.persons;
    const labels = results.questions.filter((q) => q.type === "person_list").map((q) => q.label);
    s += `。${labels.join("・")}は ${p.total} 人（檀家 ${p.member} 人、一般 ${p.public} 人）`;
  }
  return s;
}
