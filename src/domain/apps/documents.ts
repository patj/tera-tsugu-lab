// 利用者の文書（自由形式の JSON。作る、一覧、更新、削除）。本人だけが読み書きできる。spec.md §7
// 本文は暗号化して保存する。エラーのメッセージに本文を入れない。
// 1 件ずつの共有（sharing: "perDoc"）の印は shared の列に持つ（本文の外。印の変更は監査ログに残す）
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { appDocuments } from "@/db/schema";
import { APP_DOCUMENT_MAX_BYTES, appMaxDocs, type AppCreateOptions, type AppDocument } from "@/apps-sdk/types";
import type { Actor } from "../core/actor";
import { writeAuditLog } from "../core/audit";
import { conflict, invalid, notFound } from "../core/errors";
import { decryptAppData, encryptAppData } from "./crypto";
import { assertAppUser, isUuid } from "./guard";
import { getApp, getPerDocSharingApp } from "./registry";
import { appTarget } from "./sharing";

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
    shared: row.shared,
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

/** 監査ログ: 1 件ずつの共有の印の変更（文書の ID と、付けたか外したかだけ。本文とニックネームは入れない） */
async function auditDocShared(actor: Actor & { appUserId: string }, appId: string, docId: string, shared: boolean, tx: DbOrTx) {
  await writeAuditLog(
    actor,
    {
      action: "apps.documents.share",
      target: `${appTarget(actor.appUserId, appId)}/doc:${docId}`,
      summary: shared ? "この文書をお寺と共有する" : "この文書の共有をやめる",
      result: "ok",
    },
    tx,
  );
}

export async function createAppDocument(actor: Actor, appId: string, data: unknown, options: AppCreateOptions = {}): Promise<AppDocument> {
  assertAppUser(actor);
  const max = appMaxDocs(getApp(appId));
  if (options.shared !== undefined && typeof options.shared !== "boolean") throw invalid("shared は true か false にしてください");
  const shared = options.shared === true;
  if (shared) getPerDocSharingApp(appId);
  const json = serialize(data);
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(appDocuments).where(mine(actor, appId));
    if (n >= max) throw conflict(`このアプリに保存できるのは ${max} 件までです。古いものを消してください`);
    const [row] = await tx
      .insert(appDocuments)
      .values({ templeId: actor.templeId, userId: actor.appUserId, appId, ciphertext: encryptAppData(json, actor.appUserId, appId), shared })
      .returning();
    if (shared) await auditDocShared(actor, appId, row.id, true, tx);
    return toAppDocument(row);
  });
}

/**
 * 1 件ずつの共有の印を付ける・外す（sharing: "perDoc" のアプリだけ。本人の文書だけ）。
 * スタッフに見えるのは、アプリ単位で共有しているときだけ。変わったときだけ監査ログに残す
 */
export async function setAppDocumentShared(actor: Actor, appId: string, docId: string, shared: boolean): Promise<AppDocument> {
  assertAppUser(actor);
  getPerDocSharingApp(appId);
  if (typeof shared !== "boolean") throw invalid("shared は true か false にしてください");
  if (!isUuid(docId)) throw notFound("文書が見つかりません");
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select({ shared: appDocuments.shared })
      .from(appDocuments)
      .where(and(mine(actor, appId), eq(appDocuments.id, docId)))
      .for("update");
    if (!cur) throw notFound("文書が見つかりません");
    // 印だけを変える（updated_at は本文の更新の日時なので変えない）
    const [row] = await tx
      .update(appDocuments)
      .set({ shared, updatedAt: sql`${appDocuments.updatedAt}` })
      .where(and(mine(actor, appId), eq(appDocuments.id, docId)))
      .returning();
    if (cur.shared !== shared) await auditDocShared(actor, appId, docId, shared, tx);
    return toAppDocument(row);
  });
}

/** 自分の文書のうち、1 件ずつの共有の印の付いた件数（共有の設定の画面に出す） */
export async function countMySharedAppDocuments(actor: Actor, appId: string): Promise<number> {
  assertAppUser(actor);
  getPerDocSharingApp(appId);
  const [{ n }] = await db
    .select({ n: count() })
    .from(appDocuments)
    .where(and(mine(actor, appId), eq(appDocuments.shared, true)));
  return n;
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

/** 自分の文書をすべて消す（このアプリの分だけ。物理削除。元に戻せない） */
export async function deleteAllAppDocuments(actor: Actor, appId: string): Promise<number> {
  assertAppUser(actor);
  getApp(appId);
  const rows = await db.delete(appDocuments).where(mine(actor, appId)).returning({ id: appDocuments.id });
  return rows.length;
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
