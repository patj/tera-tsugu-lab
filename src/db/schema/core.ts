// 基盤（core）のテーブル: temples、staff、pending_actions、audit_logs
// テーブルの持ち主は docs/tasks/README.md の「テーブルの持ち主」を参照。
import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// ---- 共通のカラム ----
export const id = () => uuid("id").primaryKey().defaultRandom();
export const ts = (name: string) => timestamp(name, { withTimezone: true });
export const createdAt = () => ts("created_at").notNull().defaultNow();
export const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
/** すべてのテーブルに持たせる temple_id */
export const templeId = () =>
  uuid("temple_id")
    .notNull()
    .references(() => temples.id);

/** お寺の設定（spec.md §9） */
export type TempleSettings = {
  /** 法要の長さ（分） */
  memorialDurationMin: number;
  /** 本堂の準備と片付け（分。前後それぞれ） */
  bufferMin: number;
  /** 候補にする最初の開始時刻（"HH:MM"） */
  slotFirstStart: string;
  /** 候補にする最後の開始時刻（"HH:MM"） */
  slotLastStart: string;
  /** 候補の刻み（分） */
  slotStepMin: number;
};

export const temples = pgTable("temples", {
  id: id(),
  name: text("name").notNull(),
  /** 宗派プリセットの ID（src/domain/core/sect.ts） */
  sect: text("sect").notNull().default("nichiren"),
  settings: jsonb("settings").$type<TempleSettings>().notNull(),
  createdAt: createdAt(),
});

export const staff = pgTable(
  "staff",
  {
    id: id(),
    templeId: templeId(),
    name: text("name").notNull(),
    kana: text("kana"),
    /** 住職 / 副住職 / 執事長 / 奥様 / 寺務員 / アルバイトなど */
    roleTitle: text("role_title").notNull(),
    /** ログインしない人は持たない */
    email: text("email"),
    passwordHash: text("password_hash"),
    /** 法要を担当するか */
    isOfficiant: boolean("is_officiant").notNull().default(false),
    /** カレンダーなどでの表示順 */
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("staff_email_unique").on(t.email)],
);

/** MCP の書き込みの 2 段階の確認（spec.md §4） */
export const pendingActions = pgTable("pending_actions", {
  confirmationId: text("confirmation_id").primaryKey(),
  templeId: templeId(),
  tool: text("tool").notNull(),
  /** 確認を求めた操作者（confirm_action は同じ操作者だけが実行できる） */
  actorStaffId: uuid("actor_staff_id").references(() => staff.id),
  payload: jsonb("payload").notNull(),
  preview: text("preview").notNull(),
  expiresAt: ts("expires_at").notNull(),
  executedAt: ts("executed_at"),
  createdAt: createdAt(),
});

/** 監査ログ（spec.md §8） */
export const auditLogs = pgTable("audit_logs", {
  id: id(),
  templeId: uuid("temple_id").references(() => temples.id),
  /** 操作者の表示名（例: "staff:住職 高橋日照"） */
  actor: text("actor").notNull(),
  /** web / mcp / portal */
  channel: text("channel").notNull(),
  /** 操作の名前（MCP ではツール名） */
  action: text("action").notNull(),
  target: text("target"),
  /** 引数の要約など */
  summary: text("summary"),
  /** ok / needs_confirmation / error: ... */
  result: text("result"),
  createdAt: createdAt(),
});
