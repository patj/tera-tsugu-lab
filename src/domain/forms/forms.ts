// フォームと設問の作成、更新、状態、世帯ごとの個別リンク（スタッフの操作）
import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { formHouseholdTokens, formQuestions, formResponses, forms } from "@/db/schema";
import { conflict, forbidden, invalid, isStaff, notFound, writeAuditLog, type Actor } from "@/domain/core";
import { normalizeQuestion, validateFormDraft, MAX_QUESTIONS, type NormalizedQuestion } from "./draft";
import { STATUS_LABELS } from "./labels";
import { listActiveHouseholds } from "./ledger-adapter";
import type { Form, FormInput, FormMode, FormQuestion, FormStatus, FormWithQuestions, QuestionInput } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

type FormRow = typeof forms.$inferSelect;
type QuestionRow = typeof formQuestions.$inferSelect;

export function toForm(r: FormRow): Form {
  return {
    id: r.id,
    templeId: r.templeId,
    title: r.title,
    description: r.description,
    mode: r.mode as FormMode,
    status: r.status as FormStatus,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toQuestion(r: QuestionRow): FormQuestion {
  return {
    id: r.id,
    formId: r.formId,
    type: r.type as FormQuestion["type"],
    label: r.label,
    description: r.description,
    options: r.options,
    required: r.required,
    profileField: r.profileField,
    position: r.position,
    maxPersons: r.maxPersons,
    itemFields: r.itemFields,
  };
}

/** トランザクションの外から呼ばれたら、トランザクションを始める */
export async function inTx<T>(conn: DbOrTx, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return conn === db ? db.transaction((tx) => fn(tx)) : fn(conn);
}

function assertStaff(actor: Actor): void {
  if (!isStaff(actor) && actor.label !== "system") throw forbidden("フォームの管理はスタッフだけができます");
}

// ---- 読み取り ----

/** フォームの行（操作者の確認なし）。ID の形が違うときも null */
export async function findFormRow(formId: string, conn: DbOrTx = db): Promise<Form | null> {
  if (!isUuid(formId)) return null;
  const [row] = await conn.select().from(forms).where(eq(forms.id, formId));
  return row ? toForm(row) : null;
}

export async function listQuestions(formId: string, conn: DbOrTx = db): Promise<FormQuestion[]> {
  const rows = await conn
    .select()
    .from(formQuestions)
    .where(eq(formQuestions.formId, formId))
    .orderBy(asc(formQuestions.position));
  return rows.map(toQuestion);
}

async function requireForm(actor: Actor, formId: string, conn: DbOrTx): Promise<Form> {
  const form = await findFormRow(formId, conn);
  if (!form || form.templeId !== actor.templeId) throw notFound("フォームが見つかりません");
  return form;
}

/** フォームと設問（スタッフ用。下書きも見える） */
export async function getForm(actor: Actor, formId: string, conn: DbOrTx = db): Promise<FormWithQuestions> {
  assertStaff(actor);
  const form = await requireForm(actor, formId, conn);
  return { ...form, questions: await listQuestions(form.id, conn) };
}

export type FormSummary = Form & { responseCount: number };

/** フォームの一覧（新しい順）。回答の件数つき */
export async function listForms(
  actor: Actor,
  opts: { status?: FormStatus } = {},
  conn: DbOrTx = db,
): Promise<FormSummary[]> {
  assertStaff(actor);
  const where = opts.status
    ? and(eq(forms.templeId, actor.templeId), eq(forms.status, opts.status))
    : eq(forms.templeId, actor.templeId);
  const rows = await conn.select().from(forms).where(where).orderBy(desc(forms.createdAt));
  const counts = await responseCounts(
    rows.map((r) => r.id),
    conn,
  );
  return rows.map((r) => ({ ...toForm(r), responseCount: counts.get(r.id) ?? 0 }));
}

async function responseCounts(formIds: string[], conn: DbOrTx): Promise<Map<string, number>> {
  if (formIds.length === 0) return new Map();
  const rows = await conn
    .select({ formId: formResponses.formId, n: count() })
    .from(formResponses)
    .where(inArray(formResponses.formId, formIds))
    .groupBy(formResponses.formId);
  return new Map(rows.map((r) => [r.formId, Number(r.n)]));
}

export async function countResponses(formId: string, conn: DbOrTx = db): Promise<number> {
  return (await responseCounts([formId], conn)).get(formId) ?? 0;
}

// ---- 作成と更新 ----

async function insertQuestions(templeId: string, formId: string, questions: NormalizedQuestion[], start: number, conn: DbOrTx) {
  if (questions.length === 0) return;
  await conn.insert(formQuestions).values(
    questions.map((q, i) => ({
      templeId,
      formId,
      type: q.type,
      label: q.label,
      description: q.description,
      options: q.options,
      required: q.required,
      profileField: q.profileField,
      position: start + i,
      maxPersons: q.maxPersons,
      itemFields: q.itemFields,
    })),
  );
}

/**
 * フォームを作る。status を open にすると、members / both のフォームでは檀家の世帯の個別リンクも発行する。
 * conn にトランザクションを渡すと、その中で書き込む（MCP の create_form）
 */
export async function createForm(actor: Actor, input: FormInput, conn: DbOrTx = db): Promise<FormWithQuestions> {
  assertStaff(actor);
  const draft = validateFormDraft(input);
  const formId = await inTx(conn, async (tx) => {
    const [row] = await tx
      .insert(forms)
      .values({
        templeId: actor.templeId,
        title: draft.title,
        description: draft.description,
        mode: draft.mode,
        status: draft.status,
      })
      .returning({ id: forms.id });
    await insertQuestions(actor.templeId, row.id, draft.questions, 0, tx);
    if (draft.status === "open" && draft.mode !== "public") await issueTokens(actor.templeId, row.id, tx);
    await writeAuditLog(
      actor,
      { action: "forms.create", target: `form:${row.id}`, summary: `${draft.title}（${draft.mode}、${STATUS_LABELS[draft.status]}）`, result: "ok" },
      tx,
    );
    return row.id;
  });
  return getForm(actor, formId, conn);
}

/** 題名、説明、公開範囲を変える */
export async function updateFormMeta(
  actor: Actor,
  formId: string,
  input: { title: string; description?: string | null; mode: FormMode },
  conn: DbOrTx = db,
): Promise<void> {
  assertStaff(actor);
  const form = await requireForm(actor, formId, conn);
  const draft = validateFormDraft({ ...input, questions: [] });
  await inTx(conn, async (tx) => {
    await tx
      .update(forms)
      .set({ title: draft.title, description: draft.description, mode: draft.mode, updatedAt: new Date() })
      .where(eq(forms.id, form.id));
    if (form.status === "open" && draft.mode !== "public") await issueTokens(form.templeId, form.id, tx);
    await writeAuditLog(actor, { action: "forms.update", target: `form:${form.id}`, summary: draft.title, result: "ok" }, tx);
  });
}

/** 状態を変える。受付中にすると、members / both のフォームでは、まだ個別リンクがない世帯に発行する */
export async function setFormStatus(actor: Actor, formId: string, status: FormStatus, conn: DbOrTx = db): Promise<void> {
  assertStaff(actor);
  const form = await requireForm(actor, formId, conn);
  if (!(["draft", "open", "closed"] as const).includes(status)) throw invalid("状態が正しくありません");
  if (form.status === status) return;
  if (status === "draft" && (await countResponses(form.id, conn)) > 0) {
    throw conflict("回答があるフォームは下書きに戻せません");
  }
  if (status === "open" && (await listQuestions(form.id, conn)).length === 0) {
    throw invalid("設問が 1 つもないフォームは受付中にできません");
  }
  await inTx(conn, async (tx) => {
    await tx.update(forms).set({ status, updatedAt: new Date() }).where(eq(forms.id, form.id));
    if (status === "open" && form.mode !== "public") await issueTokens(form.templeId, form.id, tx);
    await writeAuditLog(
      actor,
      { action: "forms.status", target: `form:${form.id}`, summary: `${form.title}: ${STATUS_LABELS[form.status]} → ${STATUS_LABELS[status]}`, result: "ok" },
      tx,
    );
  });
}

/** 回答のあるフォームの設問は変えられない（回答は設問の ID で持つため） */
async function requireEditable(actor: Actor, formId: string, conn: DbOrTx): Promise<Form> {
  const form = await requireForm(actor, formId, conn);
  if ((await countResponses(form.id, conn)) > 0) {
    throw conflict("回答が届いているフォームの設問は変えられません（題名、説明、状態は変えられます）");
  }
  return form;
}

async function requireQuestion(actor: Actor, questionId: string, conn: DbOrTx): Promise<FormQuestion> {
  if (!isUuid(questionId)) throw notFound("設問が見つかりません");
  const [row] = await conn.select().from(formQuestions).where(eq(formQuestions.id, questionId));
  if (!row || row.templeId !== actor.templeId) throw notFound("設問が見つかりません");
  return toQuestion(row);
}

async function touch(formId: string, conn: DbOrTx) {
  await conn.update(forms).set({ updatedAt: new Date() }).where(eq(forms.id, formId));
}

export async function addQuestion(actor: Actor, formId: string, input: QuestionInput, conn: DbOrTx = db): Promise<string> {
  assertStaff(actor);
  const form = await requireEditable(actor, formId, conn);
  const existing = await listQuestions(form.id, conn);
  if (existing.length >= MAX_QUESTIONS) throw invalid(`設問は ${MAX_QUESTIONS} 個までにしてください`);
  const q = normalizeQuestion(input, existing.length);
  const position = existing.length === 0 ? 0 : existing[existing.length - 1].position + 1;
  return inTx(conn, async (tx) => {
    const [row] = await tx
      .insert(formQuestions)
      .values({ templeId: form.templeId, formId: form.id, ...q, position })
      .returning({ id: formQuestions.id });
    await touch(form.id, tx);
    return row.id;
  });
}

export async function updateQuestion(actor: Actor, questionId: string, input: QuestionInput, conn: DbOrTx = db): Promise<void> {
  assertStaff(actor);
  const current = await requireQuestion(actor, questionId, conn);
  await requireEditable(actor, current.formId, conn);
  const all = await listQuestions(current.formId, conn);
  const q = normalizeQuestion(input, all.findIndex((x) => x.id === current.id));
  await inTx(conn, async (tx) => {
    await tx.update(formQuestions).set(q).where(eq(formQuestions.id, current.id));
    await touch(current.formId, tx);
  });
}

export async function moveQuestion(actor: Actor, questionId: string, direction: "up" | "down", conn: DbOrTx = db): Promise<void> {
  assertStaff(actor);
  const current = await requireQuestion(actor, questionId, conn);
  await requireEditable(actor, current.formId, conn);
  const all = await listQuestions(current.formId, conn);
  const i = all.findIndex((x) => x.id === current.id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return;
  const other = all[j];
  await inTx(conn, async (tx) => {
    await tx.update(formQuestions).set({ position: other.position }).where(eq(formQuestions.id, current.id));
    await tx.update(formQuestions).set({ position: current.position }).where(eq(formQuestions.id, other.id));
    await touch(current.formId, tx);
  });
}

export async function deleteQuestion(actor: Actor, questionId: string, conn: DbOrTx = db): Promise<void> {
  assertStaff(actor);
  const current = await requireQuestion(actor, questionId, conn);
  await requireEditable(actor, current.formId, conn);
  await inTx(conn, async (tx) => {
    await tx.delete(formQuestions).where(eq(formQuestions.id, current.id));
    await touch(current.formId, tx);
  });
}

// ---- 世帯ごとの個別リンク ----

/** 推測できないトークン（128 ビット） */
export function newToken(): string {
  return randomBytes(16).toString("base64url");
}

async function issueTokens(templeId: string, formId: string, conn: DbOrTx): Promise<number> {
  const households = await listActiveHouseholds(templeId, conn);
  if (households.length === 0) return 0;
  const rows = await conn
    .insert(formHouseholdTokens)
    .values(households.map((h) => ({ token: newToken(), templeId, formId, householdId: h.id })))
    .onConflictDoNothing({ target: [formHouseholdTokens.formId, formHouseholdTokens.householdId] })
    .returning({ token: formHouseholdTokens.token });
  return rows.length;
}

/** まだ個別リンクがない檀家の世帯に発行する。発行した件数を返す */
export async function issueHouseholdTokens(actor: Actor, formId: string, conn: DbOrTx = db): Promise<number> {
  assertStaff(actor);
  const form = await requireForm(actor, formId, conn);
  if (form.mode === "public") throw invalid("一般向け（public）のフォームには、個別リンクを発行しません");
  return issueTokens(form.templeId, form.id, conn);
}

/** 個別リンクを発行する対象（檀家の世帯）の数 */
export async function countLinkHouseholds(actor: Actor, conn: DbOrTx = db): Promise<number> {
  assertStaff(actor);
  return (await listActiveHouseholds(actor.templeId, conn)).length;
}

export type HouseholdLink = { householdId: string; householdName: string; address: string | null; token: string | null; url: string | null };

/** 檀家の世帯ごとの個別リンク（印刷用）。発行していない世帯は token が null */
export async function listHouseholdLinks(actor: Actor, formId: string, conn: DbOrTx = db): Promise<HouseholdLink[]> {
  assertStaff(actor);
  const form = await requireForm(actor, formId, conn);
  const households = await listActiveHouseholds(form.templeId, conn);
  const tokens = await conn.select().from(formHouseholdTokens).where(eq(formHouseholdTokens.formId, form.id));
  const byHousehold = new Map(tokens.map((t) => [t.householdId, t.token]));
  return households.map((h) => {
    const token = byHousehold.get(h.id) ?? null;
    return { householdId: h.id, householdName: h.name, address: h.address, token, url: token ? formUrl(form.id, token) : null };
  });
}

/** 個別リンクのトークンから世帯を引く。フォームが違うトークンは null */
export async function resolveHouseholdToken(formId: string, token: string, conn: DbOrTx = db): Promise<string | null> {
  if (!token || token.length > 100) return null;
  const [row] = await conn
    .select({ formId: formHouseholdTokens.formId, householdId: formHouseholdTokens.householdId })
    .from(formHouseholdTokens)
    .where(eq(formHouseholdTokens.token, token));
  return row && row.formId === formId ? row.householdId : null;
}

/** 世帯の個別リンクのトークン（テストと管理画面用） */
export async function findHouseholdToken(formId: string, householdId: string, conn: DbOrTx = db): Promise<string | null> {
  const [row] = await conn
    .select({ token: formHouseholdTokens.token })
    .from(formHouseholdTokens)
    .where(and(eq(formHouseholdTokens.formId, formId), eq(formHouseholdTokens.householdId, householdId)));
  return row?.token ?? null;
}

// ---- リンク ----

/** 公開リンクの基準の URL（環境変数 APP_BASE_URL。なければ http://localhost:3000） */
export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** 公開フォームの URL。token をつけると個別リンク */
export function formUrl(formId: string, token?: string): string {
  const path = `/f/${formId}`;
  return `${appBaseUrl()}${path}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
}
