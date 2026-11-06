// 【統合時に `@/domain/ledger` の関数に置き換える】
// 台帳（households、persons）は 01 台帳のテーブル。01 が getHouseholdMembers(householdId) と getHousehold(actor, id) を
// 提供するまでの仮の読み取り。フォームの機能からは、台帳を必ずこのファイル経由で読む（置き換える場所を 1 か所にするため）。
//
// 置き換えの対応:
// - getHouseholdMembers      → @/domain/ledger の getHouseholdMembers(householdId)
// - getHouseholdProfile      → @/domain/ledger の getHousehold(actor, id)（住所、電話、窓口、世帯主）
// - getPersonProfile         → 01 に依頼する（ポータルの回答者の氏名、カナ、生年月日、性別、携帯、メール、世帯）
// - listActiveHouseholds     → 01 に依頼する（個別リンクを発行する、檀家の世帯の一覧）
// - getHouseholdNames        → 01 に依頼する（回答の一覧と CSV に出す世帯の名前。getHousehold を 1 件ずつ呼んでもよい）
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { households, persons } from "@/db/schema";

export type LedgerMember = {
  id: string;
  householdId: string;
  familyName: string;
  givenName: string;
  /** 姓と名を空白でつないだもの */
  name: string;
  kana: string | null;
  /** YYYY-MM-DD */
  birthDate: string | null;
  /** male / female */
  gender: string | null;
  mobilePhone: string | null;
  email: string | null;
};

export type LedgerHousehold = {
  id: string;
  templeId: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: string;
  headPersonId: string | null;
  contactPersonId: string | null;
};

type PersonRow = typeof persons.$inferSelect;

function toMember(p: PersonRow): LedgerMember {
  return {
    id: p.id,
    householdId: p.householdId,
    familyName: p.familyName,
    givenName: p.givenName,
    name: `${p.familyName} ${p.givenName}`,
    kana: p.kana,
    birthDate: p.birthDate,
    gender: p.gender,
    mobilePhone: p.mobilePhone,
    email: p.email,
  };
}

/** 世帯の、生きている家族 */
export async function getHouseholdMembers(householdId: string, conn: DbOrTx = db): Promise<LedgerMember[]> {
  const rows = await conn
    .select()
    .from(persons)
    .where(and(eq(persons.householdId, householdId), eq(persons.isDeceased, false)))
    .orderBy(asc(persons.birthDate), asc(persons.createdAt));
  return rows.map(toMember);
}

/** 世帯の住所、電話、窓口、世帯主 */
export async function getHouseholdProfile(householdId: string, conn: DbOrTx = db): Promise<LedgerHousehold | null> {
  const [h] = await conn.select().from(households).where(eq(households.id, householdId));
  if (!h) return null;
  return {
    id: h.id,
    templeId: h.templeId,
    name: h.name,
    address: h.address,
    phone: h.phone,
    status: h.status,
    headPersonId: h.headPersonId,
    contactPersonId: h.contactPersonId,
  };
}

/** 個人（生きている人だけ。ポータルの回答者に使う） */
export async function getPersonProfile(personId: string, conn: DbOrTx = db): Promise<LedgerMember | null> {
  const [p] = await conn.select().from(persons).where(eq(persons.id, personId));
  if (!p || p.isDeceased) return null;
  return toMember(p);
}

/** 檀家（active）の世帯の一覧。名前の順 */
export async function listActiveHouseholds(
  templeId: string,
  conn: DbOrTx = db,
): Promise<Pick<LedgerHousehold, "id" | "name" | "address">[]> {
  return conn
    .select({ id: households.id, name: households.name, address: households.address })
    .from(households)
    .where(and(eq(households.templeId, templeId), eq(households.status, "active")))
    .orderBy(asc(households.kana), asc(households.name));
}

/** 世帯の名前をまとめて引く（回答の一覧と CSV に使う） */
export async function getHouseholdNames(ids: string[], conn: DbOrTx = db): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await conn
    .select({ id: households.id, name: households.name })
    .from(households)
    .where(inArray(households.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}
