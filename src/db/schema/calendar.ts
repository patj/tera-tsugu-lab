// スタッフのカレンダー（calendar）のテーブル: staff_events、staff_event_assignees（spec.md §3.2、§9）
import { pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, staff, templeId, ts, updatedAt } from "./core";
import { memorialServices } from "./memorial";

export const staffEvents = pgTable("staff_events", {
  id: id(),
  templeId: templeId(),
  /** private（私的。内容は本人だけ）/ shared（業務） */
  visibility: text("visibility").notNull(),
  /** 作った人（私的な予定では本人） */
  ownerStaffId: uuid("owner_staff_id")
    .notNull()
    .references(() => staff.id),
  /** 法要 / 行事 / 外出 / 来客 / その他 / 私用 */
  category: text("category").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  startAt: ts("start_at").notNull(),
  endAt: ts("end_at").notNull(),
  memorialServiceId: uuid("memorial_service_id").references(() => memorialServices.id),
  /** 取り消した日時（取り消した予定は表示も空き判定もしない） */
  cancelledAt: ts("cancelled_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 予定の担当者。私的な予定は本人 1 人 */
export const staffEventAssignees = pgTable(
  "staff_event_assignees",
  {
    templeId: templeId(),
    staffEventId: uuid("staff_event_id")
      .notNull()
      .references(() => staffEvents.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
  },
  (t) => [primaryKey({ columns: [t.staffEventId, t.staffId] })],
);
