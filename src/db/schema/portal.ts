// 檀家ポータル（portal）のテーブル: portal_accounts、portal_invites、portal_login_tokens（spec.md §2.1、§9）
import { boolean, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, templeId, ts } from "./core";
import { persons } from "./ledger";

export const portalAccounts = pgTable(
  "portal_accounts",
  {
    id: id(),
    templeId: templeId(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    email: text("email").notNull(),
    /** 家系図と家の法要の予定を見られる（窓口が家族ごとに与える） */
    canViewHousehold: boolean("can_view_household").notNull().default(false),
    /** 窓口の代わりに法要を申し込める */
    canApplyMemorial: boolean("can_apply_memorial").notNull().default(false),
    lastLoginAt: ts("last_login_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("portal_accounts_person_unique").on(t.personId),
    uniqueIndex("portal_accounts_email_unique").on(t.email),
  ],
);

/** 招待コード（個人ごと） */
export const portalInvites = pgTable(
  "portal_invites",
  {
    id: id(),
    templeId: templeId(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    code: text("code").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("portal_invites_code_unique").on(t.code)],
);

/** マジックリンク（有効期限は 15 分、1 回だけ使える）。トークンはハッシュにして保存する */
export const portalLoginTokens = pgTable(
  "portal_login_tokens",
  {
    id: id(),
    templeId: templeId(),
    portalAccountId: uuid("portal_account_id")
      .notNull()
      .references(() => portalAccounts.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("portal_login_tokens_hash_unique").on(t.tokenHash)],
);
