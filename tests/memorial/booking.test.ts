// 年忌の検証、候補の日時、確定、取り消し（ドメイン層）
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq, isNull } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { memorialRequests, memorialServices, memorialServiceTargets, reservations, staffEvents } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { createSharedEvent } from "@/domain/calendar";
import { getStaffById, isDomainError, jst, jstTimeString, staffActor, type Actor } from "@/domain/core";
import { createReservation, getMainHallId } from "@/domain/facility";
import {
  bookMemorialService,
  cancelMemorialService,
  createMemorialRequest,
  findMemorialSlots,
  getHouseholdMemorialSchedule,
  getMemorialService,
  listMemorialRequestsForHousehold,
  planMemorialBooking,
  verifyMemorial,
  type BookMemorialServiceInput,
} from "@/domain/memorial";
import { resetDb } from "../helpers/db";

const NOW = new Date("2026-11-09T01:00:00Z");
const TODAY = "2026-11-09";

let seed: SeedContext;
let staff: Actor;
let mcpStaff: Actor;

const isCode = (code: string) => (e: unknown) => isDomainError(e) && e.code === code;
const roles = (s: { officiants: { roleTitle: string }[] }) => s.officiants.map((o) => o.roleTitle);

after(async () => {
  await closeDb();
});

before(async () => {
  seed = await resetDb();
  const s = (await getStaffById(seed.get("staff:jushoku")))!;
  staff = staffActor(s, "web");
  mcpStaff = staffActor(s, "mcp");
});

describe("年忌の検証（verifyMemorial）", () => {
  it("1. 「山田」「父」で探すと 2 人が並び、1 人に決めない（法号、没年、その年の回忌つき）", async () => {
    const r = await verifyMemorial(staff, {
      name: "山田",
      relation: "父",
      kaiki: 7,
      period: { from: "2027-03-01", to: "2027-03-31" },
      today: TODAY,
    });
    assert.equal(r.status, "needs_identification");
    if (r.status !== "needs_identification") return;
    const byName = new Map(r.candidates.map((c) => [c.name, c]));
    const taro = byName.get("山田 太郎")!;
    const taichi = byName.get("山田 太一")!;
    assert.equal(taro.homyo, "慈光院日太信士");
    assert.equal(taro.deathYear, 2021);
    assert.equal(taro.kaikiNameInYear, "七回忌");
    assert.equal(taro.matchesRequestedKaiki, true);
    assert.equal(taichi.homyo, "慈雲院日一信士");
    assert.equal(taichi.kaikiNameInYear, "十回忌");
    assert.equal(taichi.isMemorialYear, false);
    assert.equal(taichi.matchesRequestedKaiki, false);
    assert.notEqual(taro.household.id, taichi.household.id);
  });

  it("2〜4. 太郎さんで確かめる: 2027 年は七回忌、祥月命日 3/24、同じ世帯のキヨさんが十三回忌（複数霊位供養の提案）", async () => {
    const r = await verifyMemorial(staff, {
      personId: seed.get("person:yamada:father"),
      kaiki: 7,
      period: { from: "2027-03-01", to: "2027-03-31" },
      today: TODAY,
    });
    assert.equal(r.status, "verified");
    if (r.status !== "verified") return;
    assert.equal(r.year, 2027);
    assert.equal(r.kaikiName, "七回忌");
    assert.equal(r.checks.kaiki.ok, true);
    assert.equal(r.meinichi, "2027-03-24");
    // 期間の一部が命日より後: 警告ではなく案内
    assert.equal(r.checks.meinichi.afterMeinichi, false);
    assert.match(r.checks.meinichi.message, /3\/24/);
    assert.deepEqual(
      r.checks.joint.candidates.map((c) => `${c.name} ${c.kaikiName} ${c.meinichi}`),
      ["山田 キヨ 十三回忌 2027-08-10"],
    );
    assert.match(r.checks.joint.message, /複数霊位供養/);
    assert.deepEqual(r.warnings, []);
  });

  it("回忌の食い違いと、命日より後の日を指摘する", async () => {
    const r = await verifyMemorial(staff, { personId: seed.get("person:yamada:father"), kaiki: 3, date: "2027-03-28", today: TODAY });
    assert.equal(r.status, "verified");
    if (r.status !== "verified") return;
    assert.equal(r.checks.kaiki.ok, false);
    assert.match(r.checks.kaiki.message, /三回忌は 2023 年/);
    assert.equal(r.checks.meinichi.afterMeinichi, true);
    assert.equal(r.warnings.length, 2);
    // 年忌でない年（太一さんの 2027 年は十回忌）
    const t = await verifyMemorial(staff, { personId: seed.get("person:yamada_kita:father"), year: 2027, today: TODAY });
    assert.equal(t.status, "verified");
    if (t.status === "verified") assert.match(t.checks.kaiki.message, /年忌法要を営む回忌ではありません/);
  });

  it("見つからない、条件がない、故人でない人はエラーか not_found", async () => {
    assert.equal((await verifyMemorial(staff, { name: "存在しない人" })).status, "not_found");
    await assert.rejects(verifyMemorial(staff, {}), isCode("invalid"));
    await assert.rejects(verifyMemorial(staff, { personId: seed.get("person:yamada:head"), year: 2027 }), isCode("invalid"));
  });
});

describe("候補の日時（findMemorialSlots）", () => {
  it("お寺: 3/15 は 10 時と 11 時が住職だけ、12 時は住職と副住職、13 時は副住職と執事長。14 時と 15 時は本堂が前撮りで埋まる", async () => {
    const r = await findMemorialSlots(staff, {
      periods: [{ from: "2027-03-01", to: "2027-03-31" }],
      location: "temple",
      targetPersonIds: [seed.get("person:yamada:father"), seed.get("person:yamada:grandmother")],
      now: NOW,
    });
    assert.equal(r.truncated, false);
    const day = r.slots.filter((s) => s.date === "2027-03-15");
    assert.deepEqual(
      day.map((s) => `${jstTimeString(s.start)} ${roles(s).join("・")}`),
      ["10:00 住職", "11:00 住職", "12:00 住職・副住職", "13:00 副住職・執事長"],
    );
    const ten = day[0];
    assert.equal(jstTimeString(ten.hold.start), "09:50");
    assert.equal(jstTimeString(ten.hold.end), "10:50");
    assert.equal(jstTimeString(ten.end), "10:40");
    assert.equal(ten.beforeMeinichi, true);
    // 命日（3/24）より前の日が先に並ぶ
    const firstAfter = r.slots.findIndex((s) => s.beforeMeinichi === false);
    assert.ok(firstAfter > 0);
    assert.ok(r.slots.slice(0, firstAfter).every((s) => s.date <= "2027-03-24"));
    assert.ok(r.slots.slice(firstAfter).every((s) => s.date > "2027-03-24"));
    // 3/14 の 10 時と 11 時は本堂が前撮り（10:00〜12:00）で埋まる
    assert.ok(!r.slots.some((s) => s.date === "2027-03-14" && ["10:00", "11:00"].includes(jstTimeString(s.start))));
    // 3/21 の彼岸会（担当者全員 10:00〜15:00）の日は、15 時の候補も準備の 10 分が重なるので出ない
    assert.equal(r.slots.filter((s) => s.date === "2027-03-21").length, 0);
  });

  it("担当者を指定できる。自宅・墓前は本堂を見ず、移動時間で担当者を押さえる（移動時間は必須）", async () => {
    const r = await findMemorialSlots(staff, {
      periods: [{ from: "2027-03-15", to: "2027-03-15" }],
      location: "home",
      officiantStaffIds: [seed.get("staff:jushoku")],
      travelBeforeMin: 30,
      travelAfterMin: 30,
      now: NOW,
    });
    // 住職は 13:00 から外出。11:00 開始 → 10:30〜12:10、12:00 開始 → 11:30〜13:10（重なる）
    assert.deepEqual(
      r.slots.map((s) => jstTimeString(s.start)),
      ["10:00", "11:00"],
    );
    assert.equal(jstTimeString(r.slots[0].hold.start), "09:30");
    assert.equal(jstTimeString(r.slots[0].hold.end), "11:10");
    // 本堂の前撮り（14:00〜16:00）は見ないが、住職の予定（13:00〜15:30）で 14 時、15 時は埋まる。副住職なら 14 時も空く
    const f = await findMemorialSlots(staff, {
      periods: [{ from: "2027-03-15", to: "2027-03-15" }],
      location: "grave",
      officiantStaffIds: [seed.get("staff:fukujushoku")],
      travelBeforeMin: 15,
      travelAfterMin: 15,
      now: NOW,
    });
    assert.ok(f.slots.some((s) => jstTimeString(s.start) === "14:00"));
    await assert.rejects(
      findMemorialSlots(staff, { periods: [{ from: "2027-03-15", to: "2027-03-15" }], location: "home", now: NOW }),
      /移動時間/,
    );
    await assert.rejects(
      findMemorialSlots(staff, {
        periods: [{ from: "2027-03-15", to: "2027-03-15" }],
        location: "temple",
        officiantStaffIds: [seed.get("staff:okusama")],
        now: NOW,
      }),
      /法要の担当者にできるのは/,
    );
  });

  it("申請中の施設予約も埋まっているとみなす（3/16 13:00〜15:00 の前撮りは申請中）", async () => {
    const r = await findMemorialSlots(staff, { periods: [{ from: "2027-03-16", to: "2027-03-16" }], location: "temple", now: NOW });
    const times = r.slots.map((s) => jstTimeString(s.start));
    assert.ok(!times.includes("13:00"));
    assert.ok(!times.includes("14:00"));
  });
});

describe("確定（bookMemorialService）と取り消し", () => {
  const base = (): BookMemorialServiceInput => ({
    householdId: seed.get("household:yamada"),
    targets: [
      { personId: seed.get("person:yamada:father"), kaiki: 7 },
      { personId: seed.get("person:yamada:grandmother"), kaiki: 13 },
    ],
    location: "temple",
    start: jst("2027-03-15", "10:00"),
    officiantStaffId: seed.get("staff:jushoku"),
  });

  async function countFor(serviceIds: string[]) {
    const services = await db.select().from(memorialServices);
    const targets = await db.select().from(memorialServiceTargets);
    const events = (await db.select().from(staffEvents)).filter((e) => e.memorialServiceId);
    const res = (await db.select().from(reservations)).filter((r) => r.memorialServiceId);
    const reqs = await db.select().from(memorialRequests);
    return { services: services.length, targets: targets.length, events: events.length, res: res.length, reqs: reqs.length, serviceIds };
  }

  it("途中で失敗したら、何も登録されない（法要、故人、担当者の予定、本堂の予約、申し込み）", async () => {
    const before = await countFor([]);
    await assert.rejects(
      bookMemorialService(staff, base(), db, {
        now: NOW,
        hooks: {
          beforeRequestWrite: () => {
            throw new Error("テストのための失敗");
          },
        },
      }),
      /テストのための失敗/,
    );
    assert.deepEqual(await countFor([]), before);

    // 本堂の予約で重なったとき（法要と予定を入れたあと、createReservation で止まる）も何も残らない
    const hall = await getMainHallId(seed.templeId);
    await db.transaction((tx) =>
      createReservation(staff, tx, {
        facilityId: hall,
        kind: "other",
        status: "pending",
        start: jst("2027-03-15", "10:30"),
        end: jst("2027-03-15", "11:00"),
        title: "テストの仮押さえ",
      }),
    );
    // プレビュー（lock なし）は先に止める
    await assert.rejects(planMemorialBooking(mcpStaff, base(), db, { now: NOW }), /本堂は.*予約/);
    await assert.rejects(bookMemorialService(staff, base(), db, { now: NOW }), isCode("conflict"));
    const afterConflict = await countFor([]);
    assert.equal(afterConflict.services, before.services);
    assert.equal(afterConflict.events, before.events);
    assert.equal(afterConflict.reqs, before.reqs);
    await db.delete(reservations).where(eq(reservations.title, "テストの仮押さえ"));
  });

  it("電話の受付: 法要、故人ごとの回忌、担当者の予定、本堂の予約、電話の申し込み（scheduled）がまとめて登録される", async () => {
    const plan = await planMemorialBooking(mcpStaff, base(), db, { now: NOW });
    assert.equal(plan.requestAction, "phone");
    assert.equal(plan.joint, true);
    assert.equal(plan.seshu.display, "山田 健");
    assert.equal(plan.hall?.name, "本堂");
    assert.deepEqual(plan.warnings, []);
    assert.match(plan.title, /山田家 七回忌・十三回忌（複数霊位供養）/);

    const r = await bookMemorialService(staff, base(), db, { now: NOW });
    const [svc] = await db.select().from(memorialServices).where(eq(memorialServices.id, r.serviceId));
    assert.equal(svc.status, "scheduled");
    assert.equal(svc.location, "temple");
    assert.equal(svc.durationMin, 40);
    assert.equal(svc.officiantStaffId, seed.get("staff:jushoku"));
    assert.equal(svc.seshuPersonId, seed.get("person:yamada:head"));
    const targets = await db.select().from(memorialServiceTargets).where(eq(memorialServiceTargets.memorialServiceId, r.serviceId));
    assert.deepEqual(
      targets.map((t) => t.kaiki).sort((a, b) => a - b),
      [7, 13],
    );
    const [ev] = await db.select().from(staffEvents).where(eq(staffEvents.memorialServiceId, r.serviceId));
    assert.equal(ev.category, "法要");
    assert.equal(ev.visibility, "shared");
    assert.equal(jstTimeString(ev.startAt), "09:50");
    assert.equal(jstTimeString(ev.endAt), "10:50");
    assert.equal(r.reservation?.kind, "memorial");
    assert.equal(r.reservation?.status, "confirmed");
    assert.equal(jstTimeString(r.reservation!.start), "09:50");
    const [req] = await db.select().from(memorialRequests).where(eq(memorialRequests.id, r.requestId));
    assert.equal(req.source, "phone");
    assert.equal(req.status, "scheduled");
    assert.equal(req.staffId, seed.get("staff:jushoku"));
    assert.equal(req.memorialServiceId, r.serviceId);

    // 詳細
    const d = await getMemorialService(staff, r.serviceId);
    assert.equal(d.staffEvents.length, 1);
    assert.equal(d.reservations.length, 1);
    assert.equal(d.request?.source, "phone");
    assert.equal(d.joint, true);

    // 家の法要の予定: 確定に出て、目安から消える
    const sch = await getHouseholdMemorialSchedule(seed.get("household:yamada"), { today: TODAY });
    assert.equal(sch.confirmed.length, 1);
    assert.equal(sch.confirmed[0].officiantName, "住職 高橋 日照");
    assert.ok(!sch.upcoming.some((u) => u.name === "山田 太郎" && u.kaiki === 7));
    assert.ok(!sch.upcoming.some((u) => u.name === "山田 キヨ" && u.kaiki === 13));

    // 同じ時間に住職はもう空いていない。同じ年忌は二重に登録できない
    await assert.rejects(
      bookMemorialService(staff, { ...base(), targets: [{ personId: seed.get("person:yamada:grandfather"), kaiki: 38 }] }, db, { now: NOW }),
      /住職 高橋 日照は/,
    );
    await assert.rejects(
      bookMemorialService(staff, { ...base(), start: jst("2027-03-15", "13:00"), officiantStaffId: seed.get("staff:fukujushoku") }, db, {
        now: NOW,
      }),
      /すでに/,
    );

    // 取り消し: MCP からはできない。管理画面からは、予定と予約も取り消し、申し込みは受付済みに戻る
    await assert.rejects(cancelMemorialService(mcpStaff, r.serviceId), isCode("forbidden"));
    const c = await cancelMemorialService(staff, r.serviceId);
    assert.deepEqual(c, { cancelledEvents: 1, cancelledReservations: 1, reopenedRequests: 1 });
    const [svc2] = await db.select().from(memorialServices).where(eq(memorialServices.id, r.serviceId));
    assert.equal(svc2.status, "cancelled");
    const live = await db
      .select()
      .from(staffEvents)
      .where(and(eq(staffEvents.memorialServiceId, r.serviceId), isNull(staffEvents.cancelledAt)));
    assert.equal(live.length, 0);
    const [res2] = await db.select().from(reservations).where(eq(reservations.memorialServiceId, r.serviceId));
    assert.equal(res2.status, "cancelled");
    const [req2] = await db.select().from(memorialRequests).where(eq(memorialRequests.id, r.requestId));
    assert.equal(req2.status, "requested");
    assert.equal(req2.memorialServiceId, null);
    await assert.rejects(cancelMemorialService(staff, r.serviceId), isCode("conflict"));
    // 取り消したので、同じ時間にまた登録できる
    const again = await bookMemorialService(staff, base(), db, { now: NOW });
    await cancelMemorialService(staff, again.serviceId);
  });

  it("ポータルの申し込みを確定すると scheduled になり、ポータルの一覧に法要が出る。自宅は移動時間が必須", async () => {
    const tanaka = seed.get("household:tanaka");
    const { id } = await createMemorialRequest(
      { templeId: seed.templeId, channel: "portal", personId: seed.get("person:tanaka:son"), label: "portal:test" },
      {
        householdId: tanaka,
        targets: [{ personId: seed.get("person:tanaka:wife"), kaiki: 3 }],
        preferredPeriods: [{ from: "2027-04-03", to: "2027-04-11" }],
        location: "home",
      },
      { today: TODAY },
    );
    const input: BookMemorialServiceInput = {
      memorialRequestId: id,
      start: jst("2027-04-03", "11:00"),
      officiantStaffId: seed.get("staff:fukujushoku"),
    };
    await assert.rejects(bookMemorialService(staff, input, db, { now: NOW }), /行きの移動時間/);
    const r = await bookMemorialService(staff, { ...input, travelBeforeMin: 20, travelAfterMin: 25 }, db, { now: NOW });
    assert.equal(r.requestId, id);
    assert.equal(r.reservation, null);
    const [ev] = await db.select().from(staffEvents).where(eq(staffEvents.memorialServiceId, r.serviceId));
    assert.equal(jstTimeString(ev.startAt), "10:40");
    assert.equal(jstTimeString(ev.endAt), "12:05");
    const [mine] = await listMemorialRequestsForHousehold(tanaka);
    assert.equal(mine.status, "scheduled");
    assert.equal(mine.service?.officiantName, "副住職 高橋 日明");
    assert.equal(mine.service?.location, "home");
    // 確定した申し込みは、もう一度は確定できない
    await assert.rejects(bookMemorialService(staff, { ...input, travelBeforeMin: 20, travelAfterMin: 25, start: jst("2027-04-04", "11:00") }, db, { now: NOW }), isCode("conflict"));
    await cancelMemorialService(staff, r.serviceId);
    await db.delete(memorialRequests).where(eq(memorialRequests.householdId, tanaka));
  });

  it("担当者でない人、過ぎた日時、操作者がスタッフでない場合は確定できない", async () => {
    await assert.rejects(
      bookMemorialService(staff, { ...base(), officiantStaffId: seed.get("staff:okusama") }, db, { now: NOW }),
      /法要の担当者にできるのは/,
    );
    await assert.rejects(bookMemorialService(staff, { ...base(), start: jst("2026-11-01", "10:00") }, db, { now: NOW }), /過ぎた日時/);
    await assert.rejects(
      bookMemorialService({ templeId: seed.templeId, channel: "portal", personId: seed.get("person:yamada:head"), label: "x" }, base(), db, {
        now: NOW,
      }),
      isCode("forbidden"),
    );
    // 予定が入ったあとは確かめ直しで止まる
    await db.transaction((tx) =>
      createSharedEvent(staff, tx, {
        category: "来客",
        title: "テストの来客",
        start: jst("2027-03-15", "10:30"),
        end: jst("2027-03-15", "10:45"),
        assigneeStaffIds: [seed.get("staff:jushoku")],
      }),
    );
    await assert.rejects(bookMemorialService(staff, base(), db, { now: NOW }), /住職 高橋 日照は.*10:30〜10:45/);
    await db.update(staffEvents).set({ cancelledAt: new Date() }).where(eq(staffEvents.title, "テストの来客"));
  });
});
