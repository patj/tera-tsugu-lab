// 法要の受付のドメイン層の共通の部品（人と世帯の読み込み、入力の検証、表示名）
// memorial は persons / households / staff を読むだけで書かない（持ち主は ledger と core）。
import { and, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { households, persons, staff } from "@/db/schema";
import { forbidden, hidesNames, invalid, isStaff, notFound, parseDateString, type Actor } from "@/domain/core";
import { kaikiName } from "@/domain/ledger";
import { MAX_TARGETS, type TargetView } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);

export type PersonRow = typeof persons.$inferSelect;
export type HouseholdRow = typeof households.$inferSelect;

export function fullName(p: { familyName: string; givenName: string }): string {
  return `${p.familyName} ${p.givenName}`;
}

/**
 * 文の中で故人を指す言い方。管理画面では「山田 太郎さん」、MCP では「父（2021 年没）」（名前を LLM に渡さない。spec.md §4）。
 * 後ろに「の七回忌」「の祥月命日」などを続けて使う
 */
export function deceasedLabel(hide: boolean, p: { name: string; relation: string | null; deathDate: string | null }): string {
  if (!hide) return `${p.name}さん`;
  return `${p.relation || "故人"}${p.deathDate ? `（${p.deathDate.slice(0, 4)} 年没）` : ""}`;
}

/** 操作者に合わせた deceasedLabel */
export function deceasedLabelFor(actor: Actor, p: { name: string; relation: string | null; deathDate: string | null }): string {
  return deceasedLabel(hidesNames(actor), p);
}

/** スタッフだけができる操作（管理画面、MCP） */
export function assertStaff(actor: Actor): asserts actor is Actor & { staffId: string } {
  if (!isStaff(actor)) throw forbidden("この操作はスタッフだけができます");
}

export async function requireHousehold(templeId: string, id: string, conn: DbOrTx = db): Promise<HouseholdRow> {
  if (!isUuid(id)) throw notFound("世帯が見つかりません");
  const [row] = await conn
    .select()
    .from(households)
    .where(and(eq(households.id, id), eq(households.templeId, templeId)));
  if (!row) throw notFound("世帯が見つかりません");
  return row;
}

export async function findPerson(id: string, conn: DbOrTx = db): Promise<PersonRow | undefined> {
  if (!isUuid(id)) return undefined;
  const [row] = await conn.select().from(persons).where(eq(persons.id, id));
  return row;
}

export async function requirePerson(templeId: string, id: string, conn: DbOrTx = db): Promise<PersonRow> {
  const row = await findPerson(id, conn);
  if (!row || row.templeId !== templeId) throw notFound("個人が見つかりません");
  return row;
}

export async function personsByIds(ids: string[], conn: DbOrTx = db): Promise<Map<string, PersonRow>> {
  const unique = [...new Set(ids)].filter(isUuid);
  if (unique.length === 0) return new Map();
  const rows = await conn.select().from(persons).where(inArray(persons.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function householdsByIds(ids: string[], conn: DbOrTx = db): Promise<Map<string, HouseholdRow>> {
  const unique = [...new Set(ids)].filter(isUuid);
  if (unique.length === 0) return new Map();
  const rows = await conn.select().from(households).where(inArray(households.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

export type StaffRow = typeof staff.$inferSelect;

export async function staffByIds(ids: string[], conn: DbOrTx = db): Promise<Map<string, StaffRow>> {
  const unique = [...new Set(ids)].filter(isUuid);
  if (unique.length === 0) return new Map();
  const rows = await conn.select().from(staff).where(inArray(staff.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

/** "住職 高橋 日照" */
export function staffLabel(s: { roleTitle: string; name: string } | undefined | null): string {
  return s ? `${s.roleTitle} ${s.name}` : "（不明なスタッフ）";
}

export function targetView(p: PersonRow, kaiki: number): TargetView {
  return {
    personId: p.id,
    name: fullName(p),
    homyo: p.homyo,
    relation: p.relation,
    deathDate: p.deathDate,
    kaiki,
    kaikiName: kaikiName(kaiki),
  };
}

/** "七回忌（山田 太郎）・十三回忌（山田 キヨ）" */
export function targetsSummary(targets: { name: string; kaikiName: string }[]): string {
  return targets.map((t) => `${t.kaikiName}（${t.name}）`).join("・");
}

// ---- 入力の検証 ----

export function optText(v: string | null | undefined, label: string, max: number): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (!t) return null;
  if (t.length > max) throw invalid(`${label}は ${max} 文字までにしてください`);
  return t;
}

export function checkDate(s: string, label: string): string {
  try {
    parseDateString(s);
  } catch {
    throw invalid(`${label}は YYYY-MM-DD の形で、正しい日付を指定してください: ${s}`);
  }
  return s;
}

export function checkKaiki(n: unknown): number {
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 100) {
    throw invalid(`回忌は 1〜100 の整数で指定してください（一周忌は 2）: ${String(n)}`);
  }
  return n;
}

export type TargetInput = { personId: string; kaiki: number };

/**
 * 供養する故人を検証する: 1 人以上、重複なし、すべてその世帯の故人であること。
 * @returns 入力の順の故人の行
 */
export async function checkTargets(
  templeId: string,
  householdId: string,
  targets: TargetInput[],
  conn: DbOrTx = db,
): Promise<{ person: PersonRow; kaiki: number }[]> {
  if (!Array.isArray(targets) || targets.length === 0) throw invalid("供養する故人を 1 人以上選んでください");
  if (targets.length > MAX_TARGETS) throw invalid(`一度に供養できる故人は ${MAX_TARGETS} 人までです`);
  const ids = targets.map((t) => t.personId);
  if (new Set(ids).size !== ids.length) throw invalid("同じ故人が 2 回選ばれています");
  const byId = await personsByIds(ids, conn);
  return targets.map((t) => {
    const p = byId.get(t.personId);
    if (!p || p.templeId !== templeId) throw notFound("故人が見つかりません");
    if (p.householdId !== householdId) throw invalid(`${fullName(p)}さんは、この世帯の故人ではありません`);
    if (!p.isDeceased || !p.deathDate) throw invalid(`${fullName(p)}さんは故人として登録されていません`);
    return { person: p, kaiki: checkKaiki(t.kaiki) };
  });
}
