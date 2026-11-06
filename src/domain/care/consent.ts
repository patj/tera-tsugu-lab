// 共有の同意（ツール単位。履歴として追記し、今の同意は最後の行で決める）。spec.md §7
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { careConsents } from "@/db/schema";
import type { Actor } from "../core/actor";
import { writeAuditLog } from "../core/audit";
import { assertCareSubject } from "./guard";
import { getCareTool } from "./tools";

export type CareConsentKey = { subjectId: string; toolId: string };

/** 監査ログの対象（本文やニックネームは入れない） */
export function careTarget(subjectId: string, toolId?: string): string {
  return `care_subject:${subjectId.slice(0, 8)}${toolId ? `/${toolId}` : ""}`;
}

/** 今の同意が「共有する」の（相談者, ツール）。subjectIds を渡すとその人たちだけ */
export async function listCurrentSharedConsents(
  templeId: string,
  opts: { subjectIds?: string[] } = {},
  conn: DbOrTx = db,
): Promise<(CareConsentKey & { changedAt: Date })[]> {
  if (opts.subjectIds && opts.subjectIds.length === 0) return [];
  const rows = await conn
    .selectDistinctOn([careConsents.subjectId, careConsents.toolId])
    .from(careConsents)
    .where(
      and(
        eq(careConsents.templeId, templeId),
        opts.subjectIds ? inArray(careConsents.subjectId, opts.subjectIds) : undefined,
      ),
    )
    .orderBy(careConsents.subjectId, careConsents.toolId, desc(careConsents.changedAt));
  return rows.filter((r) => r.shared).map((r) => ({ subjectId: r.subjectId, toolId: r.toolId, changedAt: r.changedAt }));
}

/** 今、共有に同意しているか */
export async function isCareShared(templeId: string, subjectId: string, toolId: string, conn: DbOrTx = db): Promise<boolean> {
  const [last] = await conn
    .select({ shared: careConsents.shared })
    .from(careConsents)
    .where(and(eq(careConsents.templeId, templeId), eq(careConsents.subjectId, subjectId), eq(careConsents.toolId, toolId)))
    .orderBy(desc(careConsents.changedAt))
    .limit(1);
  return last?.shared ?? false;
}

/** 相談者本人: 今の同意 */
export async function getCareConsent(actor: Actor, toolId: string): Promise<boolean> {
  assertCareSubject(actor);
  getCareTool(toolId);
  return isCareShared(actor.templeId, actor.careSubjectId, toolId);
}

/** 相談者本人: 同意の履歴（古い順） */
export async function listMyCareConsentHistory(actor: Actor, toolId: string): Promise<{ shared: boolean; changedAt: Date }[]> {
  assertCareSubject(actor);
  getCareTool(toolId);
  return db
    .select({ shared: careConsents.shared, changedAt: careConsents.changedAt })
    .from(careConsents)
    .where(
      and(
        eq(careConsents.templeId, actor.templeId),
        eq(careConsents.subjectId, actor.careSubjectId),
        eq(careConsents.toolId, toolId),
      ),
    )
    .orderBy(asc(careConsents.changedAt));
}

/** 相談者本人: 同意を変える（履歴に追記し、監査ログに残す）。今と同じなら何もしない */
export async function setCareConsent(actor: Actor, toolId: string, shared: boolean): Promise<{ changed: boolean }> {
  assertCareSubject(actor);
  getCareTool(toolId);
  return db.transaction(async (tx) => {
    const current = await isCareShared(actor.templeId, actor.careSubjectId, toolId, tx);
    if (current === shared) return { changed: false };
    await tx.insert(careConsents).values({ templeId: actor.templeId, subjectId: actor.careSubjectId, toolId, shared });
    await writeAuditLog(
      actor,
      {
        action: "care.consent.set",
        target: careTarget(actor.careSubjectId, toolId),
        summary: shared ? "お寺と共有する" : "共有をやめる",
        result: "ok",
      },
      tx,
    );
    return { changed: true };
  });
}
