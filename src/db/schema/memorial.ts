// 法要の受付（memorial）のテーブル: memorial_requests、memorial_services、memorial_service_targets（spec.md §3、§3.1、§9）
import { boolean, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, staff, templeId, ts, updatedAt } from "./core";
import { households, persons } from "./ledger";

export const memorialServices = pgTable("memorial_services", {
  id: id(),
  templeId: templeId(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id),
  /** 施主（台帳にいる人） */
  seshuPersonId: uuid("seshu_person_id").references(() => persons.id),
  /** 施主（台帳にいない人） */
  seshuName: text("seshu_name"),
  /** temple（寺）/ home（自宅）/ grave（墓前） */
  location: text("location").notNull(),
  startAt: ts("start_at").notNull(),
  durationMin: integer("duration_min").notNull(),
  /** 自宅・墓前のときの移動時間（行き・帰り） */
  travelBeforeMin: integer("travel_before_min"),
  travelAfterMin: integer("travel_after_min"),
  officiantStaffId: uuid("officiant_staff_id")
    .notNull()
    .references(() => staff.id),
  /** scheduled / done / cancelled */
  status: text("status").notNull().default("scheduled"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 複数霊位供養に対応するため、法要と故人は N 対 N。故人ごとに回忌を持つ（一周忌は 2） */
export const memorialServiceTargets = pgTable(
  "memorial_service_targets",
  {
    templeId: templeId(),
    memorialServiceId: uuid("memorial_service_id")
      .notNull()
      .references(() => memorialServices.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    kaiki: integer("kaiki").notNull(),
  },
  (t) => [primaryKey({ columns: [t.memorialServiceId, t.personId] })],
);

export type MemorialRequestTarget = { personId: string; kaiki: number };
export type PreferredPeriod = { from: string; to: string; note?: string };

export const memorialRequests = pgTable("memorial_requests", {
  id: id(),
  templeId: templeId(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id),
  /** portal / phone */
  source: text("source").notNull(),
  /** ポータルから申し込んだ人（代理の家族を含む） */
  requestedByPersonId: uuid("requested_by_person_id").references(() => persons.id),
  /** 電話で受けたスタッフ */
  staffId: uuid("staff_id").references(() => staff.id),
  seshuPersonId: uuid("seshu_person_id").references(() => persons.id),
  seshuName: text("seshu_name"),
  targets: jsonb("targets").$type<MemorialRequestTarget[]>().notNull(),
  /** 第 1〜第 3 希望 */
  preferredPeriods: jsonb("preferred_periods").$type<PreferredPeriod[]>().notNull().default([]),
  /** temple / home / grave */
  location: text("location").notNull(),
  attendees: integer("attendees"),
  /** お斎の有無 */
  otoki: boolean("otoki"),
  notes: text("notes"),
  /** requested / scheduled / declined */
  status: text("status").notNull().default("requested"),
  declineReason: text("decline_reason"),
  memorialServiceId: uuid("memorial_service_id").references(() => memorialServices.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
