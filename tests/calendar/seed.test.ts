// カレンダーのシードが、台本（場面 0）の前提を満たしているか
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb } from "@/db/client";
import type { SeedContext } from "@/db/seed/context";
import { getCalendar, getStaffBusyIntervals, listOfficiants } from "@/domain/calendar";
import { getStaffById, isFree, jst, staffActor } from "@/domain/core";
import { resetDb } from "../helpers/db";

let seed: SeedContext;

describe("カレンダーのシード", () => {
  before(async () => {
    seed = await resetDb();
  });
  after(async () => {
    await closeDb();
  });

  it("3/15 の 10 時（準備と片付けを含めて 9:50〜10:50）は住職が空いていて、副住職と執事長は埋まっている", async () => {
    const slot = { start: jst("2027-03-15", "09:50"), end: jst("2027-03-15", "10:50") };
    const ids = (await listOfficiants(seed.templeId)).map((s) => s.id);
    const busy = await getStaffBusyIntervals(ids, { from: jst("2027-03-15"), to: jst("2027-03-16") });
    assert.equal(isFree(slot, busy[seed.get("staff:jushoku")]), true);
    assert.equal(isFree(slot, busy[seed.get("staff:fukujushoku")]), false);
    assert.equal(isFree(slot, busy[seed.get("staff:shitsujicho")]), false);
    // 住職は 9:00〜12:30 を空けてある
    assert.equal(isFree({ start: jst("2027-03-15", "09:00"), end: jst("2027-03-15", "12:30") }, busy[seed.get("staff:jushoku")]), true);
  });

  it("3 月中旬の法要の候補の時間帯（10:00〜15:00 開始）に、空いていない時間が混ざる", async () => {
    const ids = (await listOfficiants(seed.templeId)).map((s) => s.id);
    const busy = await getStaffBusyIntervals(ids, { from: jst("2027-03-12"), to: jst("2027-03-22") });
    let free = 0;
    let taken = 0;
    for (let d = 12; d <= 21; d++) {
      for (let h = 10; h <= 15; h++) {
        const start = jst(`2027-03-${d}`, `${h}:00`);
        const slot = { start: new Date(start.getTime() - 10 * 60_000), end: new Date(start.getTime() + 50 * 60_000) };
        for (const id of ids) {
          if (isFree(slot, busy[id])) free++;
          else taken++;
        }
      }
    }
    assert.ok(free > 0 && taken > 0, `空き ${free} / 埋まり ${taken}`);
  });

  it("2026 年 11 月〜2027 年 3 月に、業務の予定と、奥様を含む私的な予定がある", async () => {
    const okusama = staffActor((await getStaffById(seed.get("staff:okusama")))!, "web");
    let shared = 0;
    let othersPrivate = 0;
    let ownPrivate = 0;
    for (const [from, to] of [
      ["2026-11-01", "2026-12-01"],
      ["2026-12-01", "2027-01-01"],
      ["2027-01-01", "2027-02-01"],
      ["2027-02-01", "2027-03-01"],
      ["2027-03-01", "2027-04-01"],
    ]) {
      const view = await getCalendar(okusama, { from: jst(from), to: jst(to) });
      assert.ok(view.events.length > 0, `${from} の月に予定がない`);
      for (const e of view.events) {
        if (e.kind === "busy") othersPrivate++;
        else if (e.visibility === "shared") shared++;
        else ownPrivate++;
      }
    }
    assert.ok(shared > 20);
    assert.ok(othersPrivate > 5);
    assert.ok(ownPrivate > 0, "奥様の私的な予定");
  });
});
