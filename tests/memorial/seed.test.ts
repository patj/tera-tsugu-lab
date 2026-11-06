// 法要の受付のシードが、台本の条件を満たしているか
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { memorialRequests, memorialServices, reservations, staffEvents } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { getStaffBusyIntervals } from "@/domain/calendar";
import { jst, overlaps } from "@/domain/core";
import { getFacilityBusyIntervals } from "@/domain/facility";
import { resetDb } from "../helpers/db";

let seed: SeedContext;

before(async () => {
  seed = await resetDb();
});
after(async () => {
  await closeDb();
});

describe("法要の受付のシード", () => {
  it("確定した法要が 11 月〜3 月にあり、どれも担当者の予定を持ち、お寺の法要は本堂の予約を持つ", async () => {
    const services = await db.select().from(memorialServices);
    assert.ok(services.length >= 5);
    for (const s of services) {
      assert.equal(s.status, "scheduled");
      assert.ok(s.startAt >= jst("2026-11-01") && s.startAt < jst("2027-04-01"));
      const evs = await db.select().from(staffEvents).where(eq(staffEvents.memorialServiceId, s.id));
      assert.equal(evs.length, 1);
      const res = await db.select().from(reservations).where(eq(reservations.memorialServiceId, s.id));
      assert.equal(res.length, s.location === "temple" ? 1 : 0);
      if (s.location !== "temple") assert.ok(s.travelBeforeMin !== null && s.travelAfterMin !== null);
    }
    assert.ok(services.some((s) => s.location === "home"));
    assert.ok(services.some((s) => s.location === "grave"));
  });

  it("ポータルから受けた申し込み（受付済み）が 1〜2 件ある", async () => {
    const reqs = await db.select().from(memorialRequests).where(eq(memorialRequests.status, "requested"));
    assert.ok(reqs.length >= 1 && reqs.length <= 2);
    for (const r of reqs) {
      assert.equal(r.source, "portal");
      assert.ok(r.requestedByPersonId);
    }
  });

  it("山田家（場面 0）と田中家（場面 5）には、法要も申し込みもない", async () => {
    const ids = [seed.get("household:yamada"), seed.get("household:tanaka")];
    assert.equal((await db.select().from(memorialServices).where(inArray(memorialServices.householdId, ids))).length, 0);
    assert.equal((await db.select().from(memorialRequests).where(inArray(memorialRequests.householdId, ids))).length, 0);
  });

  it("2027-03-15 の 10 時台（09:50〜10:50）は、住職と本堂が空いている", async () => {
    const hold = { start: jst("2027-03-15", "09:50"), end: jst("2027-03-15", "10:50") };
    const busy = await getStaffBusyIntervals([seed.get("staff:jushoku")], { from: hold.start, to: hold.end });
    assert.ok(!busy[seed.get("staff:jushoku")].some((b) => overlaps(b, hold)));
    const hall = await getFacilityBusyIntervals(seed.get("facility:hondo"), { from: hold.start, to: hold.end });
    assert.ok(!hall.some((b) => overlaps(b, hold)));
  });

  it("場面 4 のため、12/6 の午前と 12/13 の午後は、法要の予約がない", async () => {
    const res = (await db.select().from(reservations)).filter((r) => r.memorialServiceId);
    const am6 = { start: jst("2026-12-06"), end: jst("2026-12-06", "12:00") };
    const pm13 = { start: jst("2026-12-13", "12:00"), end: jst("2026-12-14") };
    for (const r of res) {
      const i = { start: r.startAt, end: r.endAt };
      assert.ok(!overlaps(i, am6) && !overlaps(i, pm13));
    }
  });
});
