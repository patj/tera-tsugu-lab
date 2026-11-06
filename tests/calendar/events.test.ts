// スタッフのカレンダーのドメイン層のテスト。シードの予定と混ざらないように、2028 年の予定で確かめる
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { households, memorialServices, staffEventAssignees, staffEvents } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import {
  BUSY_LABEL,
  cancelEvent,
  cancelEventsByMemorialService,
  createEvent,
  createPrivateEvent,
  createSharedEvent,
  getCalendar,
  getEvent,
  getStaffAvailability,
  getStaffBusyIntervals,
  listMyEvents,
  listOfficiants,
  resolveStaff,
  updateEvent,
} from "@/domain/calendar";
import { getStaffById, jst, jstTimeString, portalActor, staffActor, systemActor, type Actor } from "@/domain/core";
import { resetDb } from "../helpers/db";

const SECRET_TITLE = "秘密の通院ABC";
const SECRET_BODY = "診察券を忘れないXYZ";
const DAY = "2028-05-10";

let seed: SeedContext;
let ids: Record<"jushoku" | "fuku" | "shitsuji" | "okusama" | "baito", string>;
const actors = {} as Record<"jushokuWeb" | "jushokuMcp" | "fukuWeb" | "fukuMcp" | "okusamaWeb", Actor>;

async function actorOf(id: string, channel: "web" | "mcp"): Promise<Actor> {
  return staffActor((await getStaffById(id))!, channel);
}

const range = { from: jst(DAY), to: jst("2028-05-11") };

describe("スタッフのカレンダー（ドメイン層）", () => {
  beforeEach(async () => {
    seed = await resetDb();
    ids = {
      jushoku: seed.get("staff:jushoku"),
      fuku: seed.get("staff:fukujushoku"),
      shitsuji: seed.get("staff:shitsujicho"),
      okusama: seed.get("staff:okusama"),
      baito: seed.get("staff:baito"),
    };
    actors.jushokuWeb = await actorOf(ids.jushoku, "web");
    actors.jushokuMcp = await actorOf(ids.jushoku, "mcp");
    actors.fukuWeb = await actorOf(ids.fuku, "web");
    actors.fukuMcp = await actorOf(ids.fuku, "mcp");
    actors.okusamaWeb = await actorOf(ids.okusama, "web");
  });
  after(async () => {
    await closeDb();
  });

  describe("私的な予定の内容の保護", () => {
    let privateId: string;
    beforeEach(async () => {
      privateId = await createPrivateEvent(actors.fukuWeb, {
        title: SECRET_TITLE,
        body: SECRET_BODY,
        category: "外出",
        start: jst(DAY, "10:00"),
        end: jst(DAY, "11:30"),
      });
    });

    for (const who of ["jushokuWeb", "jushokuMcp", "okusamaWeb"] as const) {
      it(`本人でない閲覧者（${who}）には、時間と「予定あり」だけを返す`, async () => {
        const view = await getCalendar(actors[who], range);
        const json = JSON.stringify(view);
        assert.ok(!json.includes(SECRET_TITLE), "タイトルが漏れている");
        assert.ok(!json.includes(SECRET_BODY), "内容が漏れている");
        assert.ok(!json.includes(privateId), "予定の ID が漏れている");
        assert.ok(!json.includes("外出"), "カテゴリが漏れている");
        assert.equal(view.events.length, 1);
        const e = view.events[0];
        assert.equal(e.kind, "busy");
        assert.deepEqual(Object.keys(e).sort(), ["end", "kind", "label", "staffId", "start", "visibility"]);
        if (e.kind !== "busy") return;
        assert.equal(e.label, BUSY_LABEL);
        assert.equal(e.staffId, ids.fuku);
        assert.equal(jstTimeString(e.start), "10:00");
        assert.equal(jstTimeString(e.end), "11:30");
      });
    }

    for (const who of ["fukuWeb", "fukuMcp"] as const) {
      it(`本人（${who}）には内容まで返す`, async () => {
        const view = await getCalendar(actors[who], range);
        const e = view.events[0];
        assert.equal(e.kind, "detail");
        if (e.kind !== "detail") return;
        assert.equal(e.id, privateId);
        assert.equal(e.title, SECRET_TITLE);
        assert.equal(e.body, SECRET_BODY);
        assert.equal(e.category, "外出");
        assert.equal(e.canEdit, true);
        assert.deepEqual(
          e.assignees.map((a) => a.staffId),
          [ids.fuku],
        );
      });
    }

    it("スタッフでない操作者（シード）にも内容を返さない。ポータルからは読めない", async () => {
      const json = JSON.stringify(await getCalendar(systemActor(seed.templeId), range));
      assert.ok(!json.includes(SECRET_TITLE) && !json.includes(SECRET_BODY));
      const portal = portalActor({ id: "00000000-0000-0000-0000-000000000000", templeId: seed.templeId, personId: "x", displayName: "檀家" });
      await assert.rejects(getCalendar(portal, range), /スタッフだけ/);
    });

    it("1 件の読み取りでも、他人の私的な予定は存在を明かさない（notFound）", async () => {
      await assert.rejects(getEvent(actors.jushokuWeb, privateId), (e: Error) => {
        assert.match(e.message, /見つかりません/);
        assert.ok(!e.message.includes(SECRET_TITLE));
        return true;
      });
      assert.equal((await getEvent(actors.fukuWeb, privateId)).title, SECRET_TITLE);
    });

    it("他人の私的な予定は、直せず、取り消せない", async () => {
      const input = { category: "私用", title: "書き換え", start: jst(DAY, "10:00"), end: jst(DAY, "11:00") };
      await assert.rejects(updateEvent(actors.jushokuWeb, privateId, input), /見つかりません/);
      await assert.rejects(cancelEvent(actors.jushokuWeb, privateId), /見つかりません/);
      const [row] = await db.select().from(staffEvents).where(eq(staffEvents.id, privateId));
      assert.equal(row.title, SECRET_TITLE);
      assert.equal(row.cancelledAt, null);
    });

    it("本人は直せて、取り消せる", async () => {
      await updateEvent(actors.fukuWeb, privateId, {
        category: "私用",
        title: "歯医者",
        start: jst(DAY, "13:00"),
        end: jst(DAY, "14:00"),
      });
      const e = await getEvent(actors.fukuWeb, privateId);
      assert.equal(e.title, "歯医者");
      assert.equal(jstTimeString(e.start), "13:00");
      await cancelEvent(actors.fukuWeb, privateId);
      assert.equal((await getCalendar(actors.fukuWeb, range)).events.length, 0);
    });

    it("自分の予定の一覧には、自分の私的な予定だけが内容つきで入る", async () => {
      const mine = await listMyEvents(actors.jushokuWeb, { from: jst(DAY), to: jst("2028-06-01") });
      assert.ok(!JSON.stringify(mine).includes(SECRET_TITLE));
      assert.equal(mine.length, 0);
      const fukuMine = await listMyEvents(actors.fukuWeb, { from: jst(DAY), to: jst("2028-06-01") });
      assert.equal(fukuMine.length, 1);
      assert.equal(fukuMine[0].title, SECRET_TITLE);
    });

    it("私的な予定も「埋まっている時間」に入る（内容は返さない）", async () => {
      const busy = await getStaffBusyIntervals([ids.fuku, ids.jushoku], range);
      assert.deepEqual(Object.keys(busy).sort(), [ids.fuku, ids.jushoku].sort());
      assert.equal(busy[ids.jushoku].length, 0);
      assert.equal(busy[ids.fuku].length, 1);
      assert.deepEqual(Object.keys(busy[ids.fuku][0]).sort(), ["end", "start"]);
      assert.equal(jstTimeString(busy[ids.fuku][0].start), "10:00");

      const avail = await getStaffAvailability(actors.jushokuMcp, { fromDate: DAY, toDate: DAY });
      const json = JSON.stringify(avail);
      assert.ok(!json.includes(SECRET_TITLE) && !json.includes(SECRET_BODY));
      const fuku = avail.find((a) => a.staff.id === ids.fuku)!;
      assert.deepEqual(
        fuku.days[0].free.map((i) => `${jstTimeString(i.start)}-${jstTimeString(i.end)}`),
        ["06:00-10:00", "11:30-21:00"],
      );
    });

    it("私的な予定はログインしているスタッフしか作れない", async () => {
      await assert.rejects(
        createPrivateEvent(systemActor(seed.templeId), { title: "x", start: jst(DAY, "10:00"), end: jst(DAY, "11:00") }),
        /ログイン/,
      );
    });
  });

  describe("業務の予定", () => {
    it("割り当てた全員の「埋まっている時間」に入り、全員の列に内容つきで出る", async () => {
      const id = await db.transaction((tx) =>
        createSharedEvent(actors.jushokuWeb, tx, {
          category: "行事",
          title: "施餓鬼会の準備",
          body: "本堂の飾りつけ",
          start: jst(DAY, "13:00"),
          end: jst(DAY, "15:00"),
          assigneeStaffIds: [ids.fuku, ids.baito, ids.fuku],
        }),
      );
      const busy = await getStaffBusyIntervals([ids.fuku, ids.baito, ids.jushoku], range);
      assert.equal(busy[ids.fuku].length, 1);
      assert.equal(busy[ids.baito].length, 1, "ログインしない人にも割り当てられる");
      assert.equal(busy[ids.jushoku].length, 0, "作った人でも、担当でなければ埋まらない");

      const view = await getCalendar(actors.okusamaWeb, range);
      const e = view.events[0];
      assert.equal(e.kind, "detail");
      if (e.kind !== "detail") return;
      assert.equal(e.id, id);
      assert.equal(e.title, "施餓鬼会の準備");
      assert.equal(e.body, "本堂の飾りつけ");
      assert.deepEqual(e.assignees.map((a) => a.staffId).sort(), [ids.fuku, ids.baito].sort());
      assert.equal(e.canEdit, true, "業務の予定は誰でも直せる");
    });

    it("スタッフで絞り込める", async () => {
      await createEvent(actors.jushokuWeb, {
        visibility: "shared",
        category: "来客",
        title: "業者",
        start: jst(DAY, "09:00"),
        end: jst(DAY, "10:00"),
        assigneeStaffIds: [ids.shitsuji],
      });
      await createEvent(actors.jushokuWeb, {
        visibility: "shared",
        category: "外出",
        title: "役所",
        start: jst(DAY, "11:00"),
        end: jst(DAY, "12:00"),
        assigneeStaffIds: [ids.jushoku],
      });
      const view = await getCalendar(actors.jushokuWeb, { ...range, staffIds: [ids.shitsuji] });
      assert.deepEqual(view.staff.map((s) => s.id), [ids.shitsuji]);
      assert.deepEqual(
        view.events.map((e) => (e.kind === "detail" ? e.title : "")),
        ["業者"],
      );
    });

    it("担当者を直すと、埋まっている時間も入れ替わる。業務の予定は別のスタッフが直せる", async () => {
      const id = await createEvent(actors.jushokuWeb, {
        visibility: "shared",
        category: "外出",
        title: "研修",
        start: jst(DAY, "09:00"),
        end: jst(DAY, "12:00"),
        assigneeStaffIds: [ids.jushoku],
      });
      await updateEvent(actors.okusamaWeb, id, {
        category: "外出",
        title: "研修（変更）",
        start: jst(DAY, "09:00"),
        end: jst(DAY, "12:00"),
        assigneeStaffIds: [ids.fuku],
      });
      const busy = await getStaffBusyIntervals([ids.jushoku, ids.fuku], range);
      assert.equal(busy[ids.jushoku].length, 0);
      assert.equal(busy[ids.fuku].length, 1);
    });

    it("入力の検証: 終わりが始まりより前、担当者なし、私用のカテゴリ、ほかのお寺の人", async () => {
      const base = {
        category: "行事",
        title: "x",
        start: jst(DAY, "10:00"),
        end: jst(DAY, "11:00"),
        assigneeStaffIds: [ids.jushoku],
      };
      await assert.rejects(createSharedEvent(actors.jushokuWeb, db, { ...base, end: jst(DAY, "09:00") }), /終わりは/);
      await assert.rejects(createSharedEvent(actors.jushokuWeb, db, { ...base, assigneeStaffIds: [] }), /担当者/);
      await assert.rejects(createSharedEvent(actors.jushokuWeb, db, { ...base, category: "私用" }), /カテゴリ/);
      await assert.rejects(createSharedEvent(actors.jushokuWeb, db, { ...base, title: "  " }), /タイトル/);
      await assert.rejects(
        createSharedEvent(actors.jushokuWeb, db, { ...base, assigneeStaffIds: ["00000000-0000-0000-0000-000000000000"] }),
        /スタッフでない/,
      );
    });

    it("スタッフでない操作者（シードなど）が作ると、最初の担当者が作った人になる", async () => {
      const id = await createSharedEvent(systemActor(seed.templeId), db, {
        category: "行事",
        title: "x",
        start: jst(DAY, "10:00"),
        end: jst(DAY, "11:00"),
        assigneeStaffIds: [ids.shitsuji, ids.jushoku],
      });
      const [row] = await db.select().from(staffEvents).where(eq(staffEvents.id, id));
      assert.equal(row.ownerStaffId, ids.shitsuji);
    });

    it("取り消した予定は、表示にも埋まっている時間にも入らない", async () => {
      const id = await createEvent(actors.jushokuWeb, {
        visibility: "shared",
        category: "その他",
        title: "x",
        start: jst(DAY, "10:00"),
        end: jst(DAY, "11:00"),
        assigneeStaffIds: [ids.jushoku],
      });
      await cancelEvent(actors.fukuWeb, id);
      assert.equal((await getCalendar(actors.jushokuWeb, range)).events.length, 0);
      assert.equal((await getStaffBusyIntervals([ids.jushoku], range))[ids.jushoku].length, 0);
      await assert.rejects(getEvent(actors.jushokuWeb, id), /見つかりません/);
    });
  });

  describe("法要の予定（04 との連携）", () => {
    let serviceId: string;
    beforeEach(async () => {
      // 法要（04 のテーブル）は、このテストのためだけに最小限の行を直接入れる
      const [h] = await db.insert(households).values({ templeId: seed.templeId, name: "テスト家" }).returning();
      const [s] = await db
        .insert(memorialServices)
        .values({
          templeId: seed.templeId,
          householdId: h.id,
          location: "temple",
          startAt: jst(DAY, "10:00"),
          durationMin: 40,
          officiantStaffId: ids.jushoku,
        })
        .returning();
      serviceId = s.id;
    });

    it("同じトランザクションの中で作れ、法要の取り消しでまとめて取り消せる", async () => {
      await db.transaction(async (tx) => {
        await createSharedEvent(actors.jushokuMcp, tx, {
          category: "法要",
          title: "テスト家 七回忌",
          start: jst(DAY, "09:50"),
          end: jst(DAY, "10:50"),
          assigneeStaffIds: [ids.jushoku],
          memorialServiceId: serviceId,
        });
      });
      const view = await getCalendar(actors.fukuWeb, range);
      const e = view.events[0];
      assert.equal(e.kind === "detail" && e.memorialServiceId, serviceId);
      assert.equal(e.kind === "detail" && e.canEdit, false, "法要の予定はカレンダーから直さない");
      await assert.rejects(cancelEvent(actors.jushokuWeb, (e as { id: string }).id), /法要の画面/);

      const n = await db.transaction((tx) => cancelEventsByMemorialService(actors.jushokuWeb, tx, serviceId));
      assert.equal(n, 1);
      assert.equal((await getStaffBusyIntervals([ids.jushoku], range))[ids.jushoku].length, 0);
      assert.equal(await db.transaction((tx) => cancelEventsByMemorialService(actors.jushokuWeb, tx, serviceId)), 0);
    });

    it("トランザクションが失敗したら、予定も担当者も残らない", async () => {
      await assert.rejects(
        db.transaction(async (tx) => {
          await createSharedEvent(actors.jushokuWeb, tx, {
            category: "法要",
            title: "テスト家 七回忌",
            start: jst(DAY, "09:50"),
            end: jst(DAY, "10:50"),
            assigneeStaffIds: [ids.jushoku],
            memorialServiceId: serviceId,
          });
          throw new Error("本堂が埋まっていた");
        }),
        /本堂/,
      );
      assert.equal((await db.select().from(staffEvents).where(eq(staffEvents.memorialServiceId, serviceId))).length, 0);
      const assignees = await db.select().from(staffEventAssignees);
      const events = await db.select({ id: staffEvents.id }).from(staffEvents);
      assert.ok(assignees.every((a) => events.some((e) => e.id === a.staffEventId)));
    });
  });

  describe("スタッフ", () => {
    it("法要の担当者（is_officiant）の一覧", async () => {
      const list = await listOfficiants(seed.templeId);
      assert.deepEqual(list.map((s) => s.roleTitle), ["住職", "副住職", "執事長"]);
    });

    it("名前や役職でスタッフを探せる", async () => {
      const found = await resolveStaff(seed.templeId, ["住職", "高橋日明", "さとう たかし", "小林"]);
      assert.deepEqual(found.map((s) => s.roleTitle), ["住職", "副住職", "執事長", "アルバイト"]);
      await assert.rejects(resolveStaff(seed.templeId, ["高橋"]), /複数/);
      await assert.rejects(resolveStaff(seed.templeId, ["山田"]), /見つかりません/);
    });
  });
});
