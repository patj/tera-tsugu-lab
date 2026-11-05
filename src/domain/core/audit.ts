// 監査ログ（spec.md §8）
import { db, type DbOrTx } from "@/db/client";
import { auditLogs } from "@/db/schema";
import type { Actor } from "./actor";

export type AuditEntry = {
  action: string;
  target?: string;
  summary?: string;
  result?: string;
};

const MAX_SUMMARY = 2000;

export async function writeAuditLog(actor: Actor, entry: AuditEntry, conn: DbOrTx = db): Promise<void> {
  await conn.insert(auditLogs).values({
    templeId: actor.templeId,
    actor: actor.label,
    channel: actor.channel,
    action: entry.action,
    target: entry.target ?? null,
    summary: entry.summary ? entry.summary.slice(0, MAX_SUMMARY) : null,
    result: entry.result ?? null,
  });
}
