// 台帳（01）の関数への入口。households と persons は 01 のテーブルなので、フォームからはここを通して使う。
// 統合のときに、仮の実装から 01 の関数を呼ぶ形に置き換えた。どれも操作者を受け取らないので、呼ぶ側で入口（個別リンクのトークン、
// ポータルのログイン）を確かめてから使う。
import { db, type DbOrTx } from "@/db/client";
import {
  getHouseholdBasics,
  getHouseholdMembers as ledgerGetHouseholdMembers,
  getHouseholdNamesByIds,
  getLivingMember,
  listActiveHouseholds as ledgerListActiveHouseholds,
  type HouseholdBasics,
  type HouseholdMember,
} from "@/domain/ledger";

export type LedgerMember = HouseholdMember;
export type LedgerHousehold = HouseholdBasics;

/** 世帯の、生きている家族 */
export function getHouseholdMembers(householdId: string, conn: DbOrTx = db): Promise<LedgerMember[]> {
  return ledgerGetHouseholdMembers(householdId, conn);
}

/** 世帯の住所、電話、窓口、世帯主 */
export function getHouseholdProfile(householdId: string, conn: DbOrTx = db): Promise<LedgerHousehold | null> {
  return getHouseholdBasics(householdId, conn);
}

/** 個人（生きている人だけ。ポータルの回答者に使う） */
export function getPersonProfile(personId: string, conn: DbOrTx = db): Promise<LedgerMember | null> {
  return getLivingMember(personId, conn);
}

/** 檀家（active）の世帯の一覧 */
export function listActiveHouseholds(templeId: string, conn: DbOrTx = db) {
  return ledgerListActiveHouseholds(templeId, conn);
}

/** 世帯の名前をまとめて引く（回答の一覧と CSV に使う） */
export function getHouseholdNames(ids: string[], conn: DbOrTx = db): Promise<Map<string, string>> {
  return getHouseholdNamesByIds(ids, conn);
}
