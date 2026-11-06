// 利用者の文書（自由形式の JSON。作る、一覧、更新、削除）。本人だけが読み書きできる。spec.md §7
// 本文は暗号化して保存する。エラーのメッセージに本文を入れない。
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appDocuments } from "@/db/schema";
import { APP_DOCUMENT_MAX_BYTES, APP_DOCUMENTS_MAX_PER_APP, type AppDocument } from "@/apps-sdk/types";
import type { Actor } from "../core/actor";
import { conflict, invalid, notFound } from "../core/errors";
import { decryptAppData, encryptAppData } from "./crypto";
import { assertAppUser, isUuid } from "./guard";
import { getApp } from "./registry";

/** data を JSON にする。JSON にできない値や、大きすぎる値は断る */
function serialize(data: unknown): string {
  if (data === undefined) throw invalid("保存する内容がありません");
  let json: string;
  try {
    json = JSON.stringify(data);
  } catch {
    throw invalid("保存できない形の内容です");
  }
  if (json === undefined) throw invalid("保存できない形の内容です");
  if (Buffer.byteLength(json, "utf8") > APP_DOCUMENT_MAX_BYTES) {
    throw invalid(`1 件の大きさは ${Math.floor(APP_DOCUMENT_MAX_BYTES / 1024)} KB までです`);
  }
  return json;
}

type Row = typeof appDocuments.$inferSelect;

/** 暗号文の行を、画面に渡す形にする */
export function toAppDocument(row: Row): AppDocument {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    data: JSON.parse(decryptAppData(row.ciphertext, row.userId, row.appId)),
  };
}

function mine(actor: Actor & { appUserId: string }, appId: string) {
  return and(eq(appDocuments.templeId, actor.templeId), eq(appDocuments.userId, actor.appUserId), eq(appDocuments.appId, appId));
}

/** 自分の文書（新しい順） */
export async function listMyAppDocuments(actor: Actor, appId: string): Promise<AppDocument[]> {
  assertAppUser(actor);
  getApp(appId);
  const rows = await db.select().from(appDocuments).where(mine(actor, appId)).orderBy(desc(appDocuments.createdAt));
  return rows.map(toAppDocument);
}

export async function createAppDocument(actor: Actor, appId: string, data: unknown): Promise<AppDocument> {
  assertAppUser(actor);
  getApp(appId);
  const json = serialize(data);
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(appDocuments).where(mine(actor, appId));
    if (n >= APP_DOCUMENTS_MAX_PER_APP) throw conflict(`このアプリに保存できるのは ${APP_DOCUMENTS_MAX_PER_APP} 件までです。古いものを消してください`);
    const [row] = await tx
      .insert(appDocuments)
      .values({ templeId: actor.templeId, userId: actor.appUserId, appId, ciphertext: encryptAppData(json, actor.appUserId, appId) })
      .returning();
    return toAppDocument(row);
  });
}

export async function updateAppDocument(actor: Actor, appId: string, docId: string, data: unknown): Promise<AppDocument> {
  assertAppUser(actor);
  getApp(appId);
  const json = serialize(data);
  if (!isUuid(docId)) throw notFound("文書が見つかりません");
  const [row] = await db
    .update(appDocuments)
    .set({ ciphertext: encryptAppData(json, actor.appUserId, appId) })
    .where(and(mine(actor, appId), eq(appDocuments.id, docId)))
    .returning();
  if (!row) throw notFound("文書が見つかりません");
  return toAppDocument(row);
}

/** 文書を消す（物理削除。元に戻せない） */
export async function deleteAppDocument(actor: Actor, appId: string, docId: string): Promise<void> {
  assertAppUser(actor);
  getApp(appId);
  if (!isUuid(docId)) throw notFound("文書が見つかりません");
  const rows = await db.delete(appDocuments).where(and(mine(actor, appId), eq(appDocuments.id, docId))).returning({ id: appDocuments.id });
  if (rows.length === 0) throw notFound("文書が見つかりません");
}

/** 自分の文書の件数（アプリの一覧に出す） */
export async function countMyAppDocuments(actor: Actor): Promise<Record<string, number>> {
  assertAppUser(actor);
  const rows = await db
    .select({ appId: appDocuments.appId, n: count() })
    .from(appDocuments)
    .where(and(eq(appDocuments.templeId, actor.templeId), eq(appDocuments.userId, actor.appUserId)))
    .groupBy(appDocuments.appId);
  return Object.fromEntries(rows.map((r) => [r.appId, r.n]));
}
