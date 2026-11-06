// 管理画面（スタッフ）向け: 共有されている相談者と記録、危機アラート。spec.md §7、§8
// - 今の同意が「共有する」のものだけを返す（共有をやめると、記録もアラートもすぐに見えなくなる）
// - 記録を開くたび、アラートを表示するたびに、監査ログに残す（本文は入れない）
import { and, count, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import { careAlerts, careEntries, careSubjects, staff } from "@/db/schema";
import type { CareEntryView } from "@/care-sdk/types";
import type { Actor } from "../core/actor";
import { writeAuditLog } from "../core/audit";
import { notFound } from "../core/errors";
import { careTarget, isCareShared, listCurrentSharedConsents } from "./consent";
import { decryptEntryRow } from "./entries";
import { assertCareStaff } from "./guard";
import { findCareTool } from "./tools";

function toolName(toolId: string): string {
  return findCareTool(toolId)?.manifest.name ?? `${toolId}（削除されたツール）`;
}

export type SharedCareSubject = {
  subjectId: string;
  nickname: string;
  toolId: string;
  toolName: string;
  sharedSince: Date;
  entryCount: number;
  lastEntryAt: Date | null;
  unseenAlerts: number;
};

/** 共有に同意している（相談者, ツール）の一覧。記録の中身は返さない */
export async function listSharedCareSubjects(actor: Actor): Promise<SharedCareSubject[]> {
  assertCareStaff(actor);
  const shared = await listCurrentSharedConsents(actor.templeId);
  if (shared.length === 0) return [];
  const subjectIds = [...new Set(shared.map((s) => s.subjectId))];
  const subjects = await db.select().from(careSubjects).where(inArray(careSubjects.id, subjectIds));
  const nick = new Map(subjects.map((s) => [s.id, s.nickname]));
  const entryStats = await db
    .select({ subjectId: careEntries.subjectId, toolId: careEntries.toolId, n: count(), last: max(careEntries.createdAt) })
    .from(careEntries)
    .where(and(eq(careEntries.templeId, actor.templeId), inArray(careEntries.subjectId, subjectIds)))
    .groupBy(careEntries.subjectId, careEntries.toolId);
  const alertStats = await db
    .select({ subjectId: careAlerts.subjectId, toolId: careAlerts.toolId, n: count() })
    .from(careAlerts)
    .where(and(eq(careAlerts.templeId, actor.templeId), inArray(careAlerts.subjectId, subjectIds), isNull(careAlerts.seenAt)))
    .groupBy(careAlerts.subjectId, careAlerts.toolId);
  const key = (s: string, t: string) => `${s}/${t}`;
  const es = new Map(entryStats.map((e) => [key(e.subjectId, e.toolId), e]));
  const as = new Map(alertStats.map((a) => [key(a.subjectId, a.toolId), a.n]));
  return shared
    .map((s) => {
      const e = es.get(key(s.subjectId, s.toolId));
      return {
        subjectId: s.subjectId,
        nickname: nick.get(s.subjectId) ?? "（不明）",
        toolId: s.toolId,
        toolName: toolName(s.toolId),
        sharedSince: s.changedAt,
        entryCount: e?.n ?? 0,
        lastEntryAt: e?.last ? new Date(e.last) : null,
        unseenAlerts: as.get(key(s.subjectId, s.toolId)) ?? 0,
      };
    })
    .sort((a, b) => b.unseenAlerts - a.unseenAlerts || (b.lastEntryAt?.getTime() ?? 0) - (a.lastEntryAt?.getTime() ?? 0));
}

export type SharedCareEntries = {
  shared: boolean;
  nickname: string;
  toolId: string;
  toolName: string;
  entries: CareEntryView[];
};

/** 共有されている記録（新しい順）。同意がなければ空を返す。呼ぶたびに監査ログに残す */
export async function listSharedCareEntries(actor: Actor, subjectId: string, toolId: string): Promise<SharedCareEntries> {
  assertCareStaff(actor);
  const [subject] = await db
    .select()
    .from(careSubjects)
    .where(and(eq(careSubjects.id, subjectId), eq(careSubjects.templeId, actor.templeId)));
  if (!subject) throw notFound("相談者が見つかりません");
  const shared = await isCareShared(actor.templeId, subjectId, toolId);
  let entries: CareEntryView[] = [];
  if (shared) {
    const rows = await db
      .select()
      .from(careEntries)
      .where(and(eq(careEntries.templeId, actor.templeId), eq(careEntries.subjectId, subjectId), eq(careEntries.toolId, toolId)))
      .orderBy(desc(careEntries.createdAt));
    entries = rows.map(decryptEntryRow);
  }
  await writeAuditLog(actor, {
    action: "care.entries.view",
    target: careTarget(subjectId, toolId),
    summary: shared ? `${entries.length} 件を表示` : "共有の同意がないため表示しない",
    result: shared ? "ok" : "not_shared",
  });
  return { shared, nickname: subject.nickname, toolId, toolName: toolName(toolId), entries };
}

export type CareAlert = {
  id: string;
  subjectId: string;
  nickname: string;
  toolId: string;
  toolName: string;
  entryId: string;
  createdAt: Date;
  seenAt: Date | null;
  seenByName: string | null;
};

/** 危機アラート（今も共有に同意している人の分だけ。新しい順）。表示を監査ログに残す */
export async function listCareAlerts(actor: Actor, opts: { includeSeen?: boolean } = {}): Promise<CareAlert[]> {
  assertCareStaff(actor);
  const rows = await db
    .select({
      id: careAlerts.id,
      subjectId: careAlerts.subjectId,
      nickname: careSubjects.nickname,
      toolId: careAlerts.toolId,
      entryId: careAlerts.entryId,
      createdAt: careAlerts.createdAt,
      seenAt: careAlerts.seenAt,
      seenByName: staff.name,
    })
    .from(careAlerts)
    .innerJoin(careSubjects, eq(careSubjects.id, careAlerts.subjectId))
    .leftJoin(staff, eq(staff.id, careAlerts.seenBy))
    .where(and(eq(careAlerts.templeId, actor.templeId), opts.includeSeen ? undefined : isNull(careAlerts.seenAt)))
    .orderBy(desc(careAlerts.createdAt));
  const shared = new Set(
    (await listCurrentSharedConsents(actor.templeId, { subjectIds: [...new Set(rows.map((r) => r.subjectId))] })).map(
      (c) => `${c.subjectId}/${c.toolId}`,
    ),
  );
  const alerts = rows
    .filter((r) => shared.has(`${r.subjectId}/${r.toolId}`))
    .map((r) => ({ ...r, toolName: toolName(r.toolId) }));
  await writeAuditLog(actor, {
    action: "care.alerts.view",
    target: "care_alerts",
    summary: `${alerts.length} 件を表示${opts.includeSeen ? "（確認済みを含む）" : ""}`,
    result: "ok",
  });
  return alerts;
}

/** アラートを確認済みにする（今も共有に同意している場合だけ）。監査ログに残す */
export async function markCareAlertSeen(actor: Actor, alertId: string): Promise<void> {
  assertCareStaff(actor);
  const [alert] = await db
    .select()
    .from(careAlerts)
    .where(and(eq(careAlerts.id, alertId), eq(careAlerts.templeId, actor.templeId)));
  if (!alert || !(await isCareShared(actor.templeId, alert.subjectId, alert.toolId))) throw notFound("アラートが見つかりません");
  if (alert.seenAt) return;
  await db.transaction(async (tx) => {
    await tx.update(careAlerts).set({ seenBy: actor.staffId, seenAt: new Date() }).where(eq(careAlerts.id, alertId));
    await writeAuditLog(
      actor,
      { action: "care.alert.seen", target: careTarget(alert.subjectId, alert.toolId), summary: `アラート ${alertId.slice(0, 8)} を確認済みにした`, result: "ok" },
      tx,
    );
  });
}

/** 未確認のアラートの件数（管理画面のホームなどに出す。監査ログには残さない。中身は返さない） */
export async function countUnseenCareAlerts(actor: Actor): Promise<number> {
  assertCareStaff(actor);
  const rows = await db
    .select({ subjectId: careAlerts.subjectId, toolId: careAlerts.toolId })
    .from(careAlerts)
    .where(and(eq(careAlerts.templeId, actor.templeId), isNull(careAlerts.seenAt)));
  if (rows.length === 0) return 0;
  const shared = new Set(
    (await listCurrentSharedConsents(actor.templeId, { subjectIds: [...new Set(rows.map((r) => r.subjectId))] })).map(
      (c) => `${c.subjectId}/${c.toolId}`,
    ),
  );
  return rows.filter((r) => shared.has(`${r.subjectId}/${r.toolId}`)).length;
}
