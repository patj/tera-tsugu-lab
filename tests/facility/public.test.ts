// 公開ページ（/reserve）からの申請と、申請番号での状況の確認
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { contacts } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { DomainError } from "@/domain/core";
import {
  findReservationByCode,
  getPublicStatus,
  submitPublicApplication,
  type PublicApplicationInput,
} from "@/domain/facility";
import { resetDb } from "../helpers/db";

const NOW = new Date("2026-11-09T01:00:00Z");
let seed: SeedContext;

function base(over: Partial<PublicApplicationInput> = {}): PublicApplicationInput {
  return {
    facilityId: seed.get("facility:teien"),
    kind: "photo",
    date: "2026-12-12",
    period: "am",
    name: "山口 花子",
    phone: "090-2222-3333",
    ...over,
  };
}
const isCode = (code: string) => (e: unknown) => e instanceof DomainError && e.code === code;

describe("公開ページからの申請", () => {
  beforeEach(async () => {
    seed = await resetDb();
  });
  after(async () => {
    await closeDb();
  });

  it("一般コンタクトを作り、申請中の予約にして、申請番号を返す", async () => {
    const { requestCode } = await submitPublicApplication(base({ email: "h@example.com", notes: "家族 5 人" }), NOW);
    const r = (await findReservationByCode(seed.templeId, requestCode))!;
    assert.equal(r.status, "pending");
    assert.equal(r.facilityName, "庭園");
    assert.equal(r.notes, "家族 5 人");
    const [c] = await db.select().from(contacts).where(eq(contacts.id, r.contactId!));
    assert.equal(c.name, "山口 花子");
    assert.equal(c.phone, "090-2222-3333");
    assert.equal(c.email, "h@example.com");
  });

  it("午前は 9:00〜12:00、午後は 13:00〜17:00、終日は 9:00〜17:00、時刻の指定もできる", async () => {
    const times = async (over: Partial<PublicApplicationInput>) => {
      const { requestCode } = await submitPublicApplication(base(over), NOW);
      const s = (await getPublicStatus(requestCode))!;
      return [s.start.toISOString(), s.end.toISOString()];
    };
    assert.deepEqual(await times({ date: "2026-12-12", period: "am" }), ["2026-12-12T00:00:00.000Z", "2026-12-12T03:00:00.000Z"]);
    assert.deepEqual(await times({ date: "2026-12-12", period: "pm" }), ["2026-12-12T04:00:00.000Z", "2026-12-12T08:00:00.000Z"]);
    assert.deepEqual(await times({ date: "2026-12-18", period: "day" }), ["2026-12-18T00:00:00.000Z", "2026-12-18T08:00:00.000Z"]);
    assert.deepEqual(await times({ date: "2026-12-19", period: "custom", startTime: "10:30", endTime: "11:30" }), [
      "2026-12-19T01:30:00.000Z",
      "2026-12-19T02:30:00.000Z",
    ]);
  });

  it("重なる時間には申請できない。メッセージに予約の内容は出さない", async () => {
    await submitPublicApplication(base(), NOW);
    await assert.rejects(submitPublicApplication(base({ name: "別の人" }), NOW), (e: Error) => {
      assert.ok(isCode("conflict")(e));
      assert.doesNotMatch(e.message, /前撮り|山口|申請中/);
      return true;
    });
    // 失敗した申請の一般コンタクトは残らない（同じトランザクション）
    const rows = await db.select().from(contacts).where(eq(contacts.name, "別の人"));
    assert.equal(rows.length, 0);
  });

  it("入力の検証（名前、電話、種類、日付の範囲、時刻）", async () => {
    await assert.rejects(submitPublicApplication(base({ name: " " }), NOW), isCode("invalid"));
    await assert.rejects(submitPublicApplication(base({ phone: "abc" }), NOW), isCode("invalid"));
    await assert.rejects(submitPublicApplication(base({ email: "nope" }), NOW), isCode("invalid"));
    await assert.rejects(submitPublicApplication(base({ kind: "memorial" }), NOW), isCode("invalid"));
    await assert.rejects(submitPublicApplication(base({ date: "2026-11-09" }), NOW), /翌日以降/);
    await assert.rejects(submitPublicApplication(base({ date: "2027-12-01" }), NOW), /までの日/);
    await assert.rejects(
      submitPublicApplication(base({ period: "custom", startTime: "12:00", endTime: "11:00" }), NOW),
      isCode("invalid"),
    );
    await assert.rejects(
      submitPublicApplication(base({ period: "custom", startTime: "10:15", endTime: "11:00" }), NOW),
      isCode("invalid"),
    );
  });

  it("申請番号の画面には、状態と（お断りのときは）理由だけを出す", async () => {
    const { requestCode } = await submitPublicApplication(base({ notes: "秘密のメモ" }), NOW);
    const s = (await getPublicStatus(requestCode.toLowerCase()))!;
    assert.equal(s.statusLabel, "申請中");
    assert.equal(s.kindLabel, "前撮り撮影");
    assert.equal(JSON.stringify(s).includes("秘密のメモ"), false);
    assert.equal(JSON.stringify(s).includes("山口"), false);
    assert.equal(await getPublicStatus("ZZZZ-ZZZZ"), null);
    assert.equal(await getPublicStatus("でたらめ"), null);
  });
});
