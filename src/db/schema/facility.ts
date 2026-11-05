// 施設予約（facility）のテーブル: facilities、reservations（spec.md §6、§9）
// 同じ施設の pending と confirmed の時間が重ならないことは、src/db/sql/ の排他制約でも守る。
import { integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, templeId, ts, updatedAt } from "./core";
import { contacts, households } from "./ledger";
import { memorialServices } from "./memorial";

export const facilities = pgTable("facilities", {
  id: id(),
  templeId: templeId(),
  name: text("name").notNull(),
  /** 表示順 */
  position: integer("position").notNull().default(0),
});

export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    templeId: templeId(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id),
    /** memorial / photo / tea / other */
    kind: text("kind").notNull(),
    /** pending（申請中＝仮押さえ）/ confirmed / rejected / cancelled */
    status: text("status").notNull(),
    /** 準備と片付けを含む */
    startAt: ts("start_at").notNull(),
    endAt: ts("end_at").notNull(),
    householdId: uuid("household_id").references(() => households.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    memorialServiceId: uuid("memorial_service_id").references(() => memorialServices.id),
    /** 申請番号（外部の人が状況を確認するのに使う） */
    requestCode: text("request_code"),
    title: text("title"),
    notes: text("notes"),
    rejectReason: text("reject_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("reservations_request_code_unique").on(t.requestCode)],
);
