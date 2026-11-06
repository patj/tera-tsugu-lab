// お寺との共有の設定（アプリ単位。履歴として追記し、今の設定は最後の行で決める）。spec.md §7
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { appConsents } from "@/db/schema";
import type { Actor } from "../core/actor";
import { writeAuditLog } from "../core/audit";
import { assertAppUser } from "./guard";
import { getSharingApp } from "./registry";

/** 監査ログの対象（本文やニックネームは入れない） */
export function appTarget(userId: string, appId: string): string {
  return `app_user:${userId.slice(0, 8)}/${appId}`;
}

/** 今、共有している（利用者, アプリ）。userIds を渡すとその人たちだけ */
export async function listCurrentSharing(
  templeId: string,
  opts: { userIds?: string[] } = {},
  conn: DbOrTx = db,
): Promise<{ userId: string; appId: string; changedAt: Date }[]> {
  if (opts.userIds && opts.userIds.length === 0) return [];
  const rows = await conn
    .selectDistinctOn([appConsents.userId, appConsents.appId])
    .from(appConsents)
    .where(and(eq(appConsents.templeId, templeId), opts.userIds ? inArray(appConsents.userId, opts.userIds) : undefined))
    .orderBy(appConsents.userId, appConsents.appId, desc(appConsents.changedAt));
  return rows.filter((r) => r.shared).map((r) => ({ userId: r.userId, appId: r.appId, changedAt: r.changedAt }));
}

/** 今、共有しているか */
export async function isAppShared(templeId: string, userId: string, appId: string, conn: DbOrTx = db): Promise<boolean> {
  const [last] = await conn
    .select({ shared: appConsents.shared })
    .from(appConsents)
    .where(and(eq(appConsents.templeId, templeId), eq(appConsents.userId, userId), eq(appConsents.appId, appId)))
    .orderBy(desc(appConsents.changedAt))
    .limit(1);
  return last?.shared ?? false;
}

/** 利用者本人: 今の設定（共有に対応していないアプリは常に false） */
export async function getAppSharing(actor: Actor, appId: string): Promise<boolean> {
  assertAppUser(actor);
  getSharingApp(appId);
  return isAppShared(actor.templeId, actor.appUserId, appId);
}

/** 利用者本人: 設定を変えた履歴（古い順） */
export async function listMyAppSharingHistory(actor: Actor, appId: string): Promise<{ shared: boolean; changedAt: Date }[]> {
  assertAppUser(actor);
  getSharingApp(appId);
  return db
    .select({ shared: appConsents.shared, changedAt: appConsents.changedAt })
    .from(appConsents)
    .where(and(eq(appConsents.templeId, actor.templeId), eq(appConsents.userId, actor.appUserId), eq(appConsents.appId, appId)))
    .orderBy(asc(appConsents.changedAt));
}

/** 利用者本人: 設定を変える（履歴に追記し、監査ログに残す）。今と同じなら何もしない */
export async function setAppSharing(actor: Actor, appId: string, shared: boolean): Promise<{ changed: boolean }> {
  assertAppUser(actor);
  getSharingApp(appId);
  return db.transaction(async (tx) => {
    if ((await isAppShared(actor.templeId, actor.appUserId, appId, tx)) === shared) return { changed: false };
    await tx.insert(appConsents).values({ templeId: actor.templeId, userId: actor.appUserId, appId, shared });
    await writeAuditLog(
      actor,
      { action: "apps.sharing.set", target: appTarget(actor.appUserId, appId), summary: shared ? "お寺と共有する" : "共有をやめる", result: "ok" },
      tx,
    );
    return { changed: true };
  });
}
