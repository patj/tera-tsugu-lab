// メンタルケア（care）のテーブル: care_subjects、care_entries、care_consents、care_alerts（spec.md §7、§9）
// 記録の本文は要配慮個人情報なので、暗号文だけを持つ（src/domain/care/crypto.ts）。MCP からは読まない。
import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, staff, templeId, ts } from "./core";
import { households } from "./ledger";

/** 匿名の相談者。ID はランダムに作り、端末の cookie にだけ保存する */
export const careSubjects = pgTable("care_subjects", {
  id: id(),
  templeId: templeId(),
  nickname: text("nickname").notNull(),
  /** 檀家の台帳とのひもづけ（ハッカソン版では使わない。spec.md §7 の未決事項） */
  linkedHouseholdId: uuid("linked_household_id").references(() => households.id),
  createdAt: createdAt(),
});

/** 記録（ツールごと）。本文は暗号文だけ */
export const careEntries = pgTable(
  "care_entries",
  {
    id: id(),
    templeId: templeId(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => careSubjects.id),
    /** プラグインの ID（tools/<tool-id>/） */
    toolId: text("tool_id").notNull(),
    /** v1:<iv>:<tag>:<暗号文>（base64url） */
    ciphertext: text("ciphertext").notNull(),
    /** 危機兆候を検知したか */
    crisisFlag: boolean("crisis_flag").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("care_entries_subject_tool").on(t.subjectId, t.toolId, t.createdAt)],
);

/** 共有の同意の履歴（追記していく。今の同意は最後の行） */
export const careConsents = pgTable(
  "care_consents",
  {
    id: id(),
    templeId: templeId(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => careSubjects.id),
    toolId: text("tool_id").notNull(),
    shared: boolean("shared").notNull(),
    /** 同じトランザクションの中でも順番が付くように clock_timestamp() にする */
    changedAt: ts("changed_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [index("care_consents_subject_tool").on(t.subjectId, t.toolId, t.changedAt)],
);

/** 危機アラート（共有している間に保存された、危機の記録にだけ作る） */
export const careAlerts = pgTable("care_alerts", {
  id: id(),
  templeId: templeId(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => careSubjects.id),
  toolId: text("tool_id").notNull(),
  entryId: uuid("entry_id")
    .notNull()
    .references(() => careEntries.id),
  seenBy: uuid("seen_by").references(() => staff.id),
  seenAt: ts("seen_at"),
  createdAt: createdAt(),
});
