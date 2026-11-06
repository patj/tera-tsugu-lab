// お寺のアプリ（apps）のテーブル: app_users、app_documents、app_consents（spec.md §7、§9）
// 文書の本文は暗号文だけを持つ（src/domain/apps/crypto.ts）。MCP からは読まない。
import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
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
