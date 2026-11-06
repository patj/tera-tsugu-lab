// 対応記録（contact_logs）と一般コンタクト（contacts）
import { asc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { contactLogs, contacts } from "@/db/schema";
import { getStaffById, invalid, isStaff, type Actor } from "@/domain/core";
import { assertCanReadHousehold, assertStaff, optText, reqText, requireHouseholdRow, splitConnArgs } from "./common";
import { listContactLogsRaw, type ContactLogEntry } from "./households";

export type AddContactLogInput = {
  householdId: string;
  /** 種類。「案内」「電話」「来寺」「その他」のどれかを使う（20 文字まで） */
  kind: string;
  body: string;
};

/**
 * 対応記録を世帯に追加する。記録者は操作者のスタッフ（ポータルの操作者なら記録者なし。自分の世帯だけ）。
 * 呼び方: addContactLog(actor, input) または addContactLog(actor, tx, input)
 */
export async function addContactLog(actor: Actor, input: AddContactLogInput): Promise<ContactLogEntry>;
export async function addContactLog(
  actor: Actor,
  tx: DbOrTx | null | undefined,
  input: AddContactLogInput,
): Promise<ContactLogEntry>;
export async function addContactLog(
  actor: Actor,
  a: DbOrTx | AddContactLogInput | null | undefined,
  b?: AddContactLogInput,
): Promise<ContactLogEntry> {
  const [conn, input] = splitConnArgs<AddContactLogInput>(a, b);
  if (!input) throw invalid("対応記録の内容がありません");
  await requireHouseholdRow(actor.templeId, input.householdId, conn);
  await assertCanReadHousehold(actor, input.householdId, conn);
  const kind = reqText(input.kind, "対応記録の種類", 20);
  const body = reqText(input.body, "対応記録の内容", 2000);
  const staffId = isStaff(actor) ? actor.staffId : null;
  const [row] = await conn
    .insert(contactLogs)
    .values({ templeId: actor.templeId, householdId: input.householdId, staffId, kind, body })
    .returning();
  const s = staffId ? await getStaffById(staffId, conn) : null;
  return {
    id: row.id,
    householdId: row.householdId,
    kind: row.kind,
    body: row.body,
    staffName: s?.name ?? null,
    createdAt: row.createdAt,
  };
}

/** 世帯の対応記録（新しい順）。スタッフだけ */
export async function listContactLogs(
  actor: Actor,
  householdId: string,
  opts: { limit?: number } = {},
  conn: DbOrTx = db,
): Promise<ContactLogEntry[]> {
  assertStaff(actor);
  await requireHouseholdRow(actor.templeId, householdId, conn);
  return listContactLogsRaw(householdId, opts.limit ?? 100, conn);
}

export type CreateContactInput = { name: string; phone?: string | null; email?: string | null };
export type Contact = { id: string; name: string; phone: string | null; email: string | null; createdAt: Date };

/**
 * 一般コンタクト（檀家ではない外部の人）を作る。03 の公開の申請フォームが使う（操作者は systemActor でよい）。
 * 電話かメールのどちらかは必須。呼び方: createContact(actor, input) または createContact(actor, tx, input)
 */
export async function createContact(actor: Actor, input: CreateContactInput): Promise<Contact>;
export async function createContact(
  actor: Actor,
  tx: DbOrTx | null | undefined,
  input: CreateContactInput,
): Promise<Contact>;
export async function createContact(
  actor: Actor,
  a: DbOrTx | CreateContactInput | null | undefined,
  b?: CreateContactInput,
): Promise<Contact> {
  const [conn, input] = splitConnArgs<CreateContactInput>(a, b);
  if (!input) throw invalid("連絡先の内容がありません");
  const name = reqText(input.name, "氏名", 60);
  const phone = optText(input.phone, "電話", 30);
  const email = optText(input.email, "メール", 200);
  if (!phone && !email) throw invalid("電話かメールのどちらかを入力してください");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("メールアドレスの形が正しくありません");
  const [row] = await conn
    .insert(contacts)
    .values({ templeId: actor.templeId, name, phone, email })
    .returning();
  return { id: row.id, name: row.name, phone: row.phone, email: row.email, createdAt: row.createdAt };
}

/** 一般コンタクトの一覧（スタッフだけ） */
export async function listContacts(actor: Actor, conn: DbOrTx = db): Promise<Contact[]> {
  assertStaff(actor);
  const rows = await conn.select().from(contacts).where(eq(contacts.templeId, actor.templeId)).orderBy(asc(contacts.name));
  return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, email: r.email, createdAt: r.createdAt }));
}

/** 一般コンタクトを 1 件取る（03 の予約の画面で、申請者の名前を出すのに使う）。なければ null */
export async function getContactById(id: string, conn: DbOrTx = db): Promise<Contact | null> {
  const [r] = await conn.select().from(contacts).where(eq(contacts.id, id));
  return r ? { id: r.id, name: r.name, phone: r.phone, email: r.email, createdAt: r.createdAt } : null;
}

/** 一般コンタクトをまとめて引く（03 の予約の一覧に申請者の名前を出すため） */
export async function getContactsByIds(ids: string[], conn: DbOrTx = db): Promise<Map<string, Contact>> {
  const out = new Map<string, Contact>();
  if (ids.length === 0) return out;
  const rows = await conn.select().from(contacts).where(inArray(contacts.id, ids));
  for (const r of rows) out.set(r.id, { id: r.id, name: r.name, phone: r.phone, email: r.email, createdAt: r.createdAt });
  return out;
}
