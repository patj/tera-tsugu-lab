// 台帳のドメイン層の共通の部品（権限の判定、入力の整形、表示名）
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { households, persons } from "@/db/schema";
import { forbidden, invalid, isStaff, notFound, parseDateString, type Actor } from "@/domain/core";

export type HouseholdStatus = "active" | "left" | "moved";
export const HOUSEHOLD_STATUSES: HouseholdStatus[] = ["active", "left", "moved"];
export const HOUSEHOLD_STATUS_LABELS: Record<HouseholdStatus, string> = {
  active: "檀家",
  left: "離檀",
  moved: "転出",
};

export type Gender = "male" | "female";
export const GENDER_LABELS: Record<Gender, string> = { male: "男", female: "女" };

export type RelationKind = "parent" | "spouse";

/** 対応記録の種類（MCP ではこの中から選ぶ。ドメイン層は 20 文字までの任意の文字列を受け付ける） */
export const CONTACT_LOG_KINDS = ["案内", "電話", "来寺", "その他"] as const;

export function statusLabel(status: string): string {
  return HOUSEHOLD_STATUS_LABELS[status as HouseholdStatus] ?? status;
}

export function fullName(p: { familyName: string; givenName: string }): string {
  return `${p.familyName} ${p.givenName}`;
}

/** スタッフだけができる操作 */
export function assertStaff(actor: Actor): void {
  if (!isStaff(actor)) throw forbidden("この操作はスタッフだけができます");
}

/** ポータルの操作者が属する世帯の ID */
export async function portalHouseholdId(actor: Actor, conn: DbOrTx = db): Promise<string> {
  if (!actor.personId) throw forbidden("この情報は見られません");
  const [row] = await conn
    .select({ householdId: persons.householdId })
    .from(persons)
    .where(and(eq(persons.id, actor.personId), eq(persons.templeId, actor.templeId)));
  if (!row) throw forbidden("この情報は見られません");
  return row.householdId;
}

/**
 * 世帯を読めるか。スタッフはお寺のすべての世帯、ポータルの操作者は自分の世帯だけ
 * （家族の権限 can_view_household の判定は 06 ポータルが行う）
 */
export async function assertCanReadHousehold(actor: Actor, householdId: string, conn: DbOrTx = db): Promise<void> {
  if (isStaff(actor)) return;
  if ((await portalHouseholdId(actor, conn)) !== householdId) throw forbidden("ほかの家の情報は見られません");
}

export async function findHouseholdRow(templeId: string, id: string, conn: DbOrTx = db) {
  if (!isUuid(id)) return undefined;
  const [row] = await conn
    .select()
    .from(households)
    .where(and(eq(households.id, id), eq(households.templeId, templeId)));
  return row;
}

export async function requireHouseholdRow(templeId: string, id: string, conn: DbOrTx = db) {
  const row = await findHouseholdRow(templeId, id, conn);
  if (!row) throw notFound("世帯が見つかりません");
  return row;
}

export async function findPersonRow(templeId: string, id: string, conn: DbOrTx = db) {
  if (!isUuid(id)) return undefined;
  const [row] = await conn
    .select()
    .from(persons)
    .where(and(eq(persons.id, id), eq(persons.templeId, templeId)));
  return row;
}

export async function requirePersonRow(templeId: string, id: string, conn: DbOrTx = db) {
  const row = await findPersonRow(templeId, id, conn);
  if (!row) throw notFound("個人が見つかりません");
  return row;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

// ---- 入力の整形 ----

/** 前後の空白を除く。空なら null */
export function optText(v: string | null | undefined, label: string, max = 200): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  if (t === "") return null;
  if (t.length > max) throw invalid(`${label}は ${max} 文字までにしてください`);
  return t;
}

export function reqText(v: string | null | undefined, label: string, max = 200): string {
  const t = optText(v, label, max);
  if (!t) throw invalid(`${label}を入力してください`);
  return t;
}

/** "YYYY-MM-DD" を検証する。空なら null */
export function optDate(v: string | null | undefined, label: string): string | null {
  const t = optText(v, label, 10);
  if (!t) return null;
  try {
    parseDateString(t);
  } catch {
    throw invalid(`${label}は YYYY-MM-DD の形で、正しい日付を入力してください: ${t}`);
  }
  return t;
}

export function optGender(v: string | null | undefined): Gender | null {
  const t = optText(v, "性別", 10);
  if (!t) return null;
  if (t !== "male" && t !== "female") throw invalid("性別は male か female で指定してください");
  return t;
}

export function reqStatus(v: string | null | undefined): HouseholdStatus {
  const t = v?.trim() || "active";
  if (!HOUSEHOLD_STATUSES.includes(t as HouseholdStatus)) throw invalid(`世帯の状態が正しくありません: ${t}`);
  return t as HouseholdStatus;
}

/** 検索の語から空白を除く（「山田太郎」でも「山田 太郎」でも当たるように） */
export function compact(s: string): string {
  return s.replace(/[\s　]+/g, "");
}

/** LIKE の特殊文字をエスケープする */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * tx を省略できる関数の引数を分ける。
 * f(actor, input) と f(actor, tx, input) の両方の呼び方を受け付ける（tx に undefined を渡してもよい）
 */
export function splitConnArgs<T>(a: DbOrTx | T | null | undefined, b: T | undefined): [DbOrTx, T] {
  if (b !== undefined) return [(a as DbOrTx | null | undefined) ?? db, b];
  return [db, a as T];
}
