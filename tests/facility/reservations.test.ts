// 施設予約のドメイン層（重なりのチェック、承認、お断り、取り消し、提供するインターフェース）
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { and, eq, gte, sql } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { households, memorialServices, reservations } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { DomainError, jst, systemActor, type Actor } from "@/domain/core";
import {
  approveReservation,
  cancelReservation,
  cancelReservationsByMemorialService,
  createReservation,
  findConcurrentReservations,
  findReservationByCode,
  generateRequestCode,
  getAvailability,
  getFacilityBusyIntervals,
  getMainHallId,
  listFacilities,
  listReservations,
  normalizeRequestCode,
  rejectReservation,
  type CreateReservationInput,
} from "@/domain/facility";
import { resetDb } from "../helpers/db";

let seed: SeedContext;
let staff: Actor;
let hondo: string;
let higashi: string;

// シードの予約と重ならない日（2027 年 5 月）を使う
const DAY = "2027-05-08";

function input(over: Partial<CreateReservationInput> & { start?: Date; end?: Date } = {}): CreateReservationInput {
  return {
    facilityId: hondo,
    kind: "photo",
    status: "confirmed",
    start: jst(DAY, "10:00"),
    end: jst(DAY, "11:00"),
    ...over,
  };
}
const at = (s: string, e: string) => ({ start: jst(DAY, s), end: jst(DAY, e) });

function isCode(code: string) {
  return (e: unknown) => e instanceof DomainError && e.code === code;
}

describe("施設予約のドメイン層", () => {
  before(async () => {
    seed = await resetDb();
    staff = { ...systemActor(seed.templeId), staffId: seed.get("staff:jushoku"), label: "staff:住職" };
    hondo = seed.get("facility:hondo");
    higashi = seed.get("facility:higashi");
  });
  beforeEach(async () => {
    await db.delete(reservations).where(gte(reservations.startAt, jst("2027-05-01")));
  });
  after(async () => {
    await closeDb();
  });

  describe("重なりのチェック", () => {
    it("確定の予約には重ねられない（conflict）", async () => {
      await createReservation(staff, db, input());
      await assert.rejects(createReservation(staff, db, input(at("10:30", "11:30"))), isCode("conflict"));
    });
    it("申請中の予約にも重ねられない", async () => {
      await createReservation(staff, db, input({ status: "pending" }));
      await assert.rejects(createReservation(staff, db, input({ ...at("09:00", "12:00"), status: "pending" })), isCode("conflict"));
    });
    it("お断りと取り消しの予約の時間には入れられる", async () => {
      const a = await createReservation(staff, db, input({ status: "pending" }));
      await rejectReservation(staff, db, a.id, "法要と重なるため");
      const b = await createReservation(staff, db, input());
      await cancelReservation(staff, db, b.id);
      await createReservation(staff, db, input());
    });
    it("端がちょうど接する予約は重ならない", async () => {
      await createReservation(staff, db, input());
      await createReservation(staff, db, input(at("11:00", "12:00")));
      await createReservation(staff, db, input(at("09:00", "10:00")));
    });
    it("別の施設なら同じ時間に入れられる", async () => {
      await createReservation(staff, db, input());
      await createReservation(staff, db, input({ facilityId: higashi }));
    });
    it("重なったときのメッセージに、相手の予約の日時と種類が入る（スタッフ向け）", async () => {
      await createReservation(staff, db, input({ kind: "tea" }));
      await assert.rejects(createReservation(staff, db, input()), (e: Error) => /本堂.*10:00〜11:00 茶会（確定/.test(e.message));
    });
    it("ドメイン層のチェックをすり抜けても、DB の排他制約を conflict にする（同時の申請）", async () => {
      const results = await Promise.allSettled([
        db.transaction((tx) => createReservation(staff, tx, input())),
        db.transaction((tx) => createReservation(staff, tx, input(at("10:30", "11:30")))),
      ]);
      const ok = results.filter((r) => r.status === "fulfilled");
      const ng = results.filter((r) => r.status === "rejected");
      assert.equal(ok.length, 1);
      assert.equal(ng.length, 1);
      assert.ok(isCode("conflict")((ng[0] as PromiseRejectedResult).reason));
    });
    it("排他制約に当たっても、呼び出し側のトランザクションは続けられる（セーブポイント）", async () => {
      await createReservation(staff, db, input());
      await db.transaction(async (tx) => {
        // ドメイン層のチェックを飛ばして、DB の制約に当てる
        await assert.rejects(
          tx.transaction((sp) =>
            sp.insert(reservations).values({
              templeId: seed.templeId,
              facilityId: hondo,
              kind: "other",
              status: "pending",
              startAt: jst(DAY, "10:30"),
              endAt: jst(DAY, "11:30"),
            }),
          ),
        );
        await createReservation(staff, tx, input(at("13:00", "14:00")));
      });
      const rows = await db.select().from(reservations).where(and(eq(reservations.facilityId, hondo), gte(reservations.startAt, jst(DAY))));
      assert.equal(rows.length, 2);
    });
    it("終わりが始まりより前ならエラー（invalid）", async () => {
      await assert.rejects(createReservation(staff, db, input(at("11:00", "10:00"))), isCode("invalid"));
    });
  });

  describe("承認、お断り、取り消し", () => {
    it("承認すると確定になる。申請中でなければ承認できない", async () => {
      const r = await createReservation(staff, db, input({ status: "pending" }));
      const ok = await approveReservation(staff, db, r.id);
      assert.equal(ok.status, "confirmed");
      await assert.rejects(approveReservation(staff, db, r.id), isCode("invalid"));
    });
    it("承認するときにも重なりを確かめ直す（自分自身とは重ならない）", async () => {
      const r = await createReservation(staff, db, input({ status: "pending" }));
      // 制約をいったん外して重なる予約を入れ、承認の確かめ直しで止まることを見る
      await db.execute(sql`ALTER TABLE reservations DROP CONSTRAINT reservations_no_overlap`);
      try {
        await db.insert(reservations).values({
          templeId: seed.templeId,
          facilityId: hondo,
          kind: "memorial",
          status: "confirmed",
          startAt: jst(DAY, "10:30"),
          endAt: jst(DAY, "11:30"),
        });
        await assert.rejects(approveReservation(staff, db, r.id), isCode("conflict"));
      } finally {
        await db.delete(reservations).where(gte(reservations.startAt, jst("2027-05-01")));
        await db.execute(sql`
          ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
          EXCLUDE USING gist (facility_id WITH =, tstzrange(start_at, end_at) WITH &&)
          WHERE (status IN ('pending', 'confirmed'))`);
      }
    });
    it("お断りには理由が必要。理由は保存される", async () => {
      const r = await createReservation(staff, db, input({ status: "pending" }));
      await assert.rejects(rejectReservation(staff, db, r.id, "  "), isCode("invalid"));
      const ng = await rejectReservation(staff, db, r.id, "法要と重なるため");
      assert.equal(ng.status, "rejected");
      assert.equal(ng.rejectReason, "法要と重なるため");
      await assert.rejects(rejectReservation(staff, db, r.id, "もう一度"), isCode("invalid"));
    });
    it("取り消せるのは申請中と確定の予約。法要の予約は管理画面の取り消しでは消せない", async () => {
      const r = await createReservation(staff, db, input());
      assert.equal((await cancelReservation(staff, db, r.id)).status, "cancelled");
      await assert.rejects(cancelReservation(staff, db, r.id), isCode("invalid"));
    });
    it("スタッフ以外は承認、お断り、確定の予約の作成ができない", async () => {
      const outsider = { ...systemActor(seed.templeId), label: "public:test" };
      const r = await createReservation(outsider, db, input({ status: "pending" }));
      await assert.rejects(approveReservation(outsider, db, r.id), isCode("forbidden"));
      await assert.rejects(rejectReservation(outsider, db, r.id, "x"), isCode("forbidden"));
      await assert.rejects(createReservation(outsider, db, input({ ...at("13:00", "14:00") })), isCode("forbidden"));
      await assert.rejects(
        createReservation(outsider, db, input({ ...at("13:00", "14:00"), kind: "memorial", status: "pending" })),
        isCode("forbidden"),
      );
    });
  });

  describe("申請番号", () => {
    it("電話で伝えやすい形（XXXX-XXXX、紛らわしい文字なし）", () => {
      for (let i = 0; i < 200; i++) {
        const c = generateRequestCode();
        assert.match(c, /^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
      }
    });
    it("小文字、ハイフンなし、全角でも受け付ける", () => {
      assert.equal(normalizeRequestCode("abcd2345"), "ABCD-2345");
      assert.equal(normalizeRequestCode("ＡＢＣＤ－２３４５"), "ABCD-2345");
      assert.equal(normalizeRequestCode("ABCD-1234"), null, "1 は使わない");
      assert.equal(normalizeRequestCode("ABC"), null);
    });
    it("予約ごとに発行され、申請番号で引ける", async () => {
      const r = await createReservation(staff, db, input({ status: "pending" }));
      assert.ok(r.requestCode);
      const found = await findReservationByCode(seed.templeId, r.requestCode!.toLowerCase().replace("-", ""));
      assert.equal(found?.id, r.id);
    });
  });

  describe("提供するインターフェース", () => {
    it("getFacilityBusyIntervals は申請中と確定の予約の時間を返す", async () => {
      await createReservation(staff, db, input({ status: "pending" }));
      await createReservation(staff, db, input(at("13:00", "14:00")));
      const x = await createReservation(staff, db, input(at("15:00", "16:00")));
      await cancelReservation(staff, db, x.id);
      const busy = await getFacilityBusyIntervals(hondo, { from: jst(DAY), to: jst("2027-05-09") });
      assert.deepEqual(
        busy.map((b) => [b.start.getTime(), b.end.getTime()]),
        [
          [jst(DAY, "10:00").getTime(), jst(DAY, "11:00").getTime()],
          [jst(DAY, "13:00").getTime(), jst(DAY, "14:00").getTime()],
        ],
      );
    });
    it("cancelReservationsByMemorialService は法要にひもづく予約を取り消す（同じトランザクションで）", async () => {
      // memorial_services の行は 04 が作る。ここではテストのために直接入れる
      const [h] = await db.insert(households).values({ templeId: seed.templeId, name: "テスト家" }).returning();
      const [ms] = await db
        .insert(memorialServices)
        .values({
          templeId: seed.templeId,
          householdId: h.id,
          location: "temple",
          startAt: jst(DAY, "10:00"),
          durationMin: 40,
          officiantStaffId: seed.get("staff:jushoku"),
        })
        .returning();
      const msId = ms.id;
      const n = await db.transaction(async (tx) => {
        const m = await createReservation(staff, tx, input({ kind: "memorial", ...at("09:50", "10:50"), memorialServiceId: msId }));
        await assert.rejects(cancelReservation(staff, tx, m.id), isCode("invalid"));
        return cancelReservationsByMemorialService(staff, tx, msId);
      });
      assert.equal(n, 1);
      assert.deepEqual(await getFacilityBusyIntervals(hondo, { from: jst(DAY), to: jst("2027-05-09") }), []);
    });
    it("getAvailability は施設ごとに、日ごとの午前・午後の◯×を返す（内容は返さない）", async () => {
      await createReservation(staff, db, input({ status: "pending" })); // 本堂 午前
      await createReservation(staff, db, input({ facilityId: higashi, ...at("12:00", "13:00") })); // 東席 午後
      const a = await getAvailability({ from: DAY, to: "2027-05-09" });
      assert.deepEqual(
        a.facilities.map((f) => f.name),
        ["本堂", "東席", "中席", "西席", "庭園"],
      );
      const day = (name: string, date: string) => a.facilities.find((f) => f.name === name)!.days.find((d) => d.date === date)!;
      assert.deepEqual(day("本堂", DAY).available, { am: false, pm: true });
      assert.deepEqual(day("東席", DAY).available, { am: true, pm: false });
      assert.deepEqual(day("本堂", "2027-05-09").available, { am: true, pm: true });
      assert.equal(day("本堂", DAY).weekday, 6);
      assert.equal(JSON.stringify(a).includes("photo"), false);
    });
    it("getMainHallId と listFacilities", async () => {
      assert.equal(await getMainHallId(seed.templeId), hondo);
      assert.equal((await listFacilities(seed.templeId)).length, 5);
    });
    it("予約の一覧は承認待ちが先頭。ほかの施設の同じ時間の予約（法要を含む）を探せる", async () => {
      await createReservation(staff, db, input());
      const p = await createReservation(staff, db, input({ facilityId: higashi, status: "pending", ...at("10:30", "12:00") }));
      const list = await listReservations(seed.templeId, { from: jst(DAY), to: jst("2027-05-09") });
      assert.equal(list[0].id, p.id);
      const c = await findConcurrentReservations(seed.templeId, p);
      assert.equal(c.sameFacility.length, 0);
      assert.equal(c.otherFacilities.length, 1);
      assert.equal(c.otherFacilities[0].facilityName, "本堂");
    });
  });
});
