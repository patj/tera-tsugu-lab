// DB の制約（src/db/sql/）のテスト。ドメイン層のチェックをすり抜けた場合の最後の守り
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { facilities, reservations } from "@/db/schema";
import { isConstraintViolation, jst } from "@/domain/core";
import { resetDb } from "../helpers/db";

let templeId: string;
let hondo: string;
let higashi: string;

function reserve(facilityId: string, start: string, end: string, status = "confirmed") {
  return db.insert(reservations).values({
    templeId,
    facilityId,
    kind: "other",
    status,
    startAt: jst("2026-12-06", start),
    endAt: jst("2026-12-06", end),
  });
}

describe("施設の予約の重なりを DB でも防ぐ", () => {
  before(async () => {
    const seed = await resetDb();
    templeId = seed.templeId;
  });
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM reservations`);
    await db.execute(sql`DELETE FROM facilities`);
    [{ id: hondo }, { id: higashi }] = await db
      .insert(facilities)
      .values([
        { templeId, name: "本堂", position: 0 },
        { templeId, name: "東席", position: 1 },
      ])
      .returning({ id: facilities.id });
  });
  after(async () => {
    await closeDb();
  });

  it("同じ施設の確定した予約には、重ねられない", async () => {
    await reserve(hondo, "10:00", "11:00");
    await assert.rejects(reserve(hondo, "10:30", "11:30"), (e) => isConstraintViolation(e, "reservations_no_overlap"));
  });
  it("申請中（pending）の予約にも重ねられない", async () => {
    await reserve(hondo, "10:00", "11:00", "pending");
    await assert.rejects(reserve(hondo, "10:30", "11:30", "pending"), (e) => isConstraintViolation(e, "reservations_no_overlap"));
  });
  it("端がちょうど接する予約は入れられる", async () => {
    await reserve(hondo, "10:00", "11:00");
    await reserve(hondo, "11:00", "12:00");
  });
  it("お断りと取り消しの予約の時間には入れられる", async () => {
    await reserve(hondo, "10:00", "11:00", "rejected");
    await reserve(hondo, "10:00", "11:00", "cancelled");
    await reserve(hondo, "10:00", "11:00", "confirmed");
  });
  it("別の施設なら同じ時間に入れられる", async () => {
    await reserve(hondo, "10:00", "11:00");
    await reserve(higashi, "10:00", "11:00");
  });
  it("終わりが始まりより前の予約は入れられない", async () => {
    await assert.rejects(reserve(hondo, "11:00", "10:00"), (e) => isConstraintViolation(e, "reservations_time_order"));
  });
});
