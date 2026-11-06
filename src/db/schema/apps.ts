// お寺のアプリ（apps）のテーブル: app_users、app_documents、app_consents、app_ai_consents、app_ai_usage（spec.md §7、§9）
// 文書の本文は暗号文だけを持つ（src/domain/apps/crypto.ts）。MCP からは読まない。
import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, templeId, ts, updatedAt } from "./core";

/** 匿名の利用者。ID はランダムに作り、端末の cookie にだけ保存する */
export const appUsers = pgTable("app_users", {
  id: id(),
  templeId: templeId(),
  nickname: text("nickname").notNull(),
  createdAt: createdAt(),
});

/** 文書（利用者 × アプリ）。中身は自由形式の JSON を暗号化したもの */
export const appDocuments = pgTable(
  "app_documents",
  {
    id: id(),
    templeId: templeId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id),
    /** アプリの ID（apps/<app-id>/） */
    appId: text("app_id").notNull(),
    /** v1:<iv>:<tag>:<暗号文>（base64url） */
    ciphertext: text("ciphertext").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("app_documents_user_app").on(t.userId, t.appId, t.createdAt)],
);

/** お寺との共有の設定の履歴（追記していく。今の設定は最後の行） */
export const appConsents = pgTable(
  "app_consents",
  {
    id: id(),
    templeId: templeId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id),
    appId: text("app_id").notNull(),
    shared: boolean("shared").notNull(),
    /** 同じトランザクションの中でも順番が付くように clock_timestamp() にする */
    changedAt: ts("changed_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [index("app_consents_user_app").on(t.userId, t.appId, t.changedAt)],
);

/** AI に送ることへの同意の履歴（追記していく。今の同意は最後の行。版が今の説明と同じときだけ有効） */
export const appAiConsents = pgTable(
  "app_ai_consents",
  {
    id: id(),
    templeId: templeId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id),
    appId: text("app_id").notNull(),
    /** 同意した説明の版（manifest の ai.purpose と ai.sends から作る。appAIConsentVersion） */
    version: text("version").notNull(),
    agreed: boolean("agreed").notNull(),
    changedAt: ts("changed_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [index("app_ai_consents_user_app").on(t.userId, t.appId, t.changedAt)],
);

/**
 * AI の使用の記録（回数と費用の上限に使う）。送った内容と返事は残さない。
 * 呼ぶ前に result = "pending" で 1 行を入れ（同時の呼び出しも数えるため）、終わったら結果とトークン数を書く
 */
export const appAiUsage = pgTable(
  "app_ai_usage",
  {
    id: id(),
    templeId: templeId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id),
    appId: text("app_id").notNull(),
    task: text("task").notNull(),
    model: text("model").notNull(),
    /** pending / ok / refusal / unavailable / invalid_output / invalid_input */
    result: text("result").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** おおよその費用（100 万分の 1 米ドル。料金表は src/apps-sdk/ai-server.ts） */
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [index("app_ai_usage_app_time").on(t.appId, t.createdAt), index("app_ai_usage_user_app_time").on(t.userId, t.appId, t.createdAt)],
);
