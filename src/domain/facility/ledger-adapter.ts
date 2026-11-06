// 【仮の実装】統合時に `@/domain/ledger` の `createContact` に置き換える。
// contacts と households は 01 台帳のテーブル。施設予約からは、このアダプターを通してだけ使う。
// 01 が createContact（と名前を引く関数）を提供したら、この中身を 01 の関数を呼ぶだけにする（引数は同じ）。
import { inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { contacts, households } from "@/db/schema";
import { invalid, type Actor } from "@/domain/core";

export type ContactInput = { name: string; phone?: string | null; email?: string | null };
export type Contact = { id: string; name: string; phone: string | null; email: string | null };

/** 一般コンタクト（檀家ではない外部の人）を作る。01 の createContact と同じ引数 */
export async function createContact(actor: Actor, tx: DbOrTx | undefined, input: ContactInput): Promise<Contact> {
  const name = input.name.trim();
  if (!name) throw invalid("氏名を入力してください");
  const [row] = await (tx ?? db)
    .insert(contacts)
    .values({
      templeId: actor.templeId,
      name,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
    })
    .returning();
  return { id: row.id, name: row.name, phone: row.phone, email: row.email };
}

/** 一般コンタクトをまとめて引く（予約の一覧に申請者の名前を出すため）。統合時に 01 の関数に置き換える */
export async function getContactsByIds(ids: string[], conn: DbOrTx = db): Promise<Map<string, Contact>> {
  const out = new Map<string, Contact>();
  if (ids.length === 0) return out;
  const rows = await conn.select().from(contacts).where(inArray(contacts.id, ids));
  for (const r of rows) out.set(r.id, { id: r.id, name: r.name, phone: r.phone, email: r.email });
  return out;
}

/** 世帯の名前（〇〇家）をまとめて引く。統合時に 01 の関数に置き換える */
export async function getHouseholdNamesByIds(ids: string[], conn: DbOrTx = db): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await conn
    .select({ id: households.id, name: households.name })
    .from(households)
    .where(inArray(households.id, ids));
  for (const r of rows) out.set(r.id, r.name);
  return out;
}
