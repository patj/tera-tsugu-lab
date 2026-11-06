// 記録の保存と、相談者本人の記録の取得。spec.md §7
// 保存: 検証 → 危機検知 → 暗号化。危機を検知したら、本人には必ず相談窓口を表示する（画面が { crisis: true } を見て出す）。
// 共有に同意している場合だけ、管理画面にアラートを出す。
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { careAlerts, careEntries } from "@/db/schema";
import type { CareEntryData, CareEntryView } from "@/care-sdk/types";
import type { Actor } from "../core/actor";
import { isCareShared } from "./consent";
import { detectCrisis } from "./crisis";
import { decryptCareData, encryptCareData } from "./crypto";
import { assertCareSubject } from "./guard";
import { getCareTool, validateCareData } from "./tools";

export type SaveCareEntryResult = {
  entryId: string;
  /** 危機兆候を検知した（画面は相談窓口を目立つように表示する） */
  crisis: boolean;
  /** 管理画面にアラートを出した（共有に同意している場合だけ） */
  alerted: boolean;
};

export async function saveCareEntry(actor: Actor, toolId: string, input: CareEntryData): Promise<SaveCareEntryResult> {
  assertCareSubject(actor);
  const tool = getCareTool(toolId);
  const data = validateCareData(tool, input);
  const crisis = detectCrisis(tool.manifest, data);
  const subjectId = actor.careSubjectId;
  const ciphertext = encryptCareData(JSON.stringify(data), subjectId, toolId);
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(careEntries)
      .values({ templeId: actor.templeId, subjectId, toolId, ciphertext, crisisFlag: crisis })
      .returning({ id: careEntries.id });
    let alerted = false;
    if (crisis && (await isCareShared(actor.templeId, subjectId, toolId, tx))) {
      await tx.insert(careAlerts).values({ templeId: actor.templeId, subjectId, toolId, entryId: entry.id });
      alerted = true;
    }
    return { entryId: entry.id, crisis, alerted };
  });
}

/** 暗号文の行を、画面に渡す形にする */
export function decryptEntryRow(row: {
  id: string;
  subjectId: string;
  toolId: string;
  ciphertext: string;
  crisisFlag: boolean;
  createdAt: Date;
}): CareEntryView {
  return {
    id: row.id,
    createdAt: row.createdAt,
    crisis: row.crisisFlag,
    data: JSON.parse(decryptCareData(row.ciphertext, row.subjectId, row.toolId)) as CareEntryData,
  };
}

/** 相談者本人: 自分の記録（新しい順） */
export async function listMyCareEntries(actor: Actor, toolId: string): Promise<CareEntryView[]> {
  assertCareSubject(actor);
  getCareTool(toolId);
  const rows = await db
    .select()
    .from(careEntries)
    .where(
      and(
        eq(careEntries.templeId, actor.templeId),
        eq(careEntries.subjectId, actor.careSubjectId),
        eq(careEntries.toolId, toolId),
      ),
    )
    .orderBy(desc(careEntries.createdAt));
  return rows.map(decryptEntryRow);
}

/** 相談者本人: 記録の件数（ツールの一覧に出す） */
export async function countMyCareEntries(actor: Actor): Promise<Record<string, number>> {
  assertCareSubject(actor);
  const rows = await db
    .select({ toolId: careEntries.toolId })
    .from(careEntries)
    .where(and(eq(careEntries.templeId, actor.templeId), eq(careEntries.subjectId, actor.careSubjectId)));
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.toolId] = (counts[r.toolId] ?? 0) + 1;
  return counts;
}
