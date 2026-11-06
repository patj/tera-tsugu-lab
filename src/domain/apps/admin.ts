// スタッフ向け: 共有している利用者と、共有された文書（読むだけ）。spec.md §7、§8
// - 今の設定が「共有する」で、アプリが共有に対応しているものだけを返す（共有をやめると、すぐに見えなくなる）
// - 文書を開くたびに、監査ログに残す（本文とニックネームは入れない）
// - 1 件ずつの共有（sharing: "perDoc"）のアプリでは、印の付いた文書だけを DB から読み、復号して渡す。
//   件数と最後の更新も、印の付いた文書だけから数える（印のない文書の様子をスタッフに見せない）
import { and, count, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db/client";
import { appDocuments, appUsers } from "@/db/schema";
import { appSharesPerDoc, appUsesSharing, type AppDocument } from "@/apps-sdk/types";
import type { Actor } from "../core/actor";
import { writeAuditLog } from "../core/audit";
import { notFound } from "../core/errors";
import { toAppDocument } from "./documents";
import { assertAppStaff, isUuid } from "./guard";
import { findApp } from "./registry";
import { appTarget, isAppShared, listCurrentSharing } from "./sharing";

export type SharedAppUser = {
  userId: string;
  nickname: string;
  appId: string;
  appName: string;
  sharedSince: Date;
  /** 1 件ずつの共有のアプリか（docCount と lastUpdatedAt は、印の付いた文書だけ） */
  perDoc: boolean;
  /** スタッフに見える文書の件数 */
  docCount: number;
  lastUpdatedAt: Date | null;
};

/** 共有している（利用者, アプリ）の一覧。文書の中身は返さない */
export async function listSharedAppUsers(actor: Actor): Promise<SharedAppUser[]> {
  assertAppStaff(actor);
  const shared = (await listCurrentSharing(actor.templeId)).filter((s) => {
    const app = findApp(s.appId);
    return app !== undefined && appUsesSharing(app);
  });
  if (shared.length === 0) return [];
  const userIds = [...new Set(shared.map((s) => s.userId))];
  const users = await db.select().from(appUsers).where(inArray(appUsers.id, userIds));
  const nick = new Map(users.map((u) => [u.id, u.nickname]));
  const stats = await db
    .select({ userId: appDocuments.userId, appId: appDocuments.appId, shared: appDocuments.shared, n: count(), last: max(appDocuments.updatedAt) })
    .from(appDocuments)
    .where(and(eq(appDocuments.templeId, actor.templeId), inArray(appDocuments.userId, userIds)))
    .groupBy(appDocuments.userId, appDocuments.appId, appDocuments.shared);
  /** 見える文書だけを数える（1 件ずつの共有のアプリでは、印の付いたものだけ） */
  const st = new Map<string, { n: number; last: Date | null }>();
  for (const s of stats) {
    const app = findApp(s.appId);
    if (!app || (appSharesPerDoc(app) && !s.shared)) continue;
    const k = `${s.userId}/${s.appId}`;
    const cur = st.get(k) ?? { n: 0, last: null };
    const last = s.last ? new Date(s.last) : null;
    st.set(k, { n: cur.n + s.n, last: last && (!cur.last || last > cur.last) ? last : cur.last });
  }
  return shared
    .map((s) => {
      const x = st.get(`${s.userId}/${s.appId}`);
      return {
        userId: s.userId,
        nickname: nick.get(s.userId) ?? "（不明）",
        appId: s.appId,
        appName: findApp(s.appId)?.name ?? s.appId,
        sharedSince: s.changedAt,
        perDoc: appSharesPerDoc(findApp(s.appId)!),
        docCount: x?.n ?? 0,
        lastUpdatedAt: x?.last ?? null,
      };
    })
    .sort((a, b) => (b.lastUpdatedAt?.getTime() ?? 0) - (a.lastUpdatedAt?.getTime() ?? 0));
}

export type SharedAppDocuments = { shared: boolean; perDoc: boolean; nickname: string; appId: string; docs: AppDocument[] };

/** 共有された文書（新しい順）。共有していなければ空を返す。呼ぶたびに監査ログに残す */
export async function listSharedAppDocuments(actor: Actor, appId: string, userId: string): Promise<SharedAppDocuments> {
  assertAppStaff(actor);
  const app = findApp(appId);
  if (!app || !isUuid(userId)) throw notFound("共有された文書が見つかりません");
  const [user] = await db
    .select()
    .from(appUsers)
    .where(and(eq(appUsers.id, userId), eq(appUsers.templeId, actor.templeId)));
  if (!user) throw notFound("共有された文書が見つかりません");
  const shared = appUsesSharing(app) && (await isAppShared(actor.templeId, userId, appId));
  const perDoc = appSharesPerDoc(app);
  let docs: AppDocument[] = [];
  if (shared) {
    // 1 件ずつの共有では、印のない文書は読み出さない（復号もしない）
    const rows = await db
      .select()
      .from(appDocuments)
      .where(
        and(
          eq(appDocuments.templeId, actor.templeId),
          eq(appDocuments.userId, userId),
          eq(appDocuments.appId, appId),
          perDoc ? eq(appDocuments.shared, true) : undefined,
        ),
      )
      .orderBy(desc(appDocuments.createdAt));
    docs = rows.map(toAppDocument);
  }
  await writeAuditLog(actor, {
    action: "apps.documents.view",
    target: appTarget(userId, appId),
    summary: shared ? `${docs.length} 件を表示` : "共有されていないため表示しない",
    result: shared ? "ok" : "not_shared",
  });
  return { shared, perDoc, nickname: user.nickname, appId, docs };
}
