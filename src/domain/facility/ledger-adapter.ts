// 台帳（01）の関数への入口。contacts と households は 01 のテーブルなので、施設予約からはここを通して使う。
// 統合のときに、仮の実装から 01 の関数を呼ぶ形に置き換えた。
import type { DbOrTx } from "@/db/client";
import type { Actor } from "@/domain/core";
import {
  createContact as ledgerCreateContact,
  getContactsByIds,
  getHouseholdNamesByIds,
  type Contact,
} from "@/domain/ledger";

export type ContactInput = { name: string; phone?: string | null; email?: string | null };
export type { Contact };
export { getContactsByIds, getHouseholdNamesByIds };

/** 一般コンタクト（檀家ではない外部の人）を作る。電話かメールのどちらかが必要（01 の決まり） */
export function createContact(actor: Actor, tx: DbOrTx | undefined, input: ContactInput): Promise<Contact> {
  return ledgerCreateContact(actor, tx, input);
}
