// 法要の申し込み（ポータルからの受付、一覧、お断り）と、家の法要の予定、回忌の提案
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { memorialRequests } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { getStaffById, isDomainError, staffActor, type Actor } from "@/domain/core";
import {
  createMemorialRequest,
  declineMemorialRequest,
  getHouseholdMemorialSchedule,
  listMemorialRequests,
  listMemorialRequestsForHousehold,
  suggestKaiki,
  type CreateMemorialRequestInput,
} from "@/domain/memorial";
import { resetDb } from "../helpers/db";

const TODAY = "2026-11-09";

let seed: SeedContext;
let staff: Actor;

const portal = (personKey: string): Actor => ({
  templeId: seed.templeId,
  channel: "portal",
  portalAccountId: undefined,
  personId: seed.get(personKey),
  label: `portal:${personKey}`,
});

const isCode = (code: string) => (e: unknown) => isDomainError(e) && e.code === code;

function tanakaInput(over: Partial<CreateMemorialRequestInput> = {}): CreateMemorialRequestInput {
  return {
    householdId: seed.get("household:tanaka"),
    targets: [{ personId: seed.get("person:tanaka:wife"), kaiki: 3 }],
    preferredPeriods: [
      { from: "2027-04-03", to: "2027-04-11", note: "土日を希望" },
      { from: "2027-03-27", to: "2027-03-28" },
    ],
    location: "temple",
    attendees: 8,
    otoki: true,
    notes: "足の悪い者がいるので、椅子をお願いします",
    ...over,
  };
}

after(async () => {
  await closeDb();
});

describe("法要の申し込み（ポータル）", () => {
  before(async () => {
    seed = await resetDb();
    const s = (await getStaffById(seed.get("staff:jushoku")))!;
    staff = staffActor(s, "web");
  });
  beforeEach(async () => {
    // 田中家の申し込みはシードにないので、テストごとに消す
    await db.delete(memorialRequests).where(eq(memorialRequests.householdId, seed.get("household:tanaka")));
  });

  it("窓口が申し込むと、source = portal、受付済みで記録され、世帯の一覧に出る", async () => {
    const actor = portal("person:tanaka:son");
    const { id } = await createMemorialRequest(actor, tanakaInput(), { today: TODAY });
    const [row] = await db.select().from(memorialRequests).where(eq(memorialRequests.id, id));
    assert.equal(row.source, "portal");
    assert.equal(row.status, "requested");
    assert.equal(row.requestedByPersonId, seed.get("person:tanaka:son"));
    // 施主の初期値は申し込んだ本人
    assert.equal(row.seshuPersonId, seed.get("person:tanaka:son"));
    assert.equal(row.staffId, null);

    const list = await listMemorialRequestsForHousehold(seed.get("household:tanaka"));
    assert.equal(list.length, 1);
    const r = list[0];
    assert.equal(r.id, id);
    assert.equal(r.status, "requested");
    assert.equal(r.requestedByName, "田中 健一");
    assert.deepEqual(r.targets, [
      { personId: seed.get("person:tanaka:wife"), name: "田中 和子", kaiki: 3, kaikiName: "三回忌" },
    ]);
    assert.deepEqual(r.preferredPeriods[0], { from: "2027-04-03", to: "2027-04-11", note: "土日を希望" });
    assert.equal(r.location, "temple");
    assert.equal(r.service, null);
    assert.equal(r.declineReason, null);

    // スタッフの一覧では、受付済みが先頭に来る
    const all = await listMemorialRequests(staff, {});
    assert.equal(all[0].status, "requested");
    assert.ok(all.some((x) => x.id === id && x.householdName === "田中家" && x.attendees === 8 && x.otoki === true));
  });

  it("複数の故人を選べる（複数霊位供養）。施主は名前でもよい", async () => {
    const actor = portal("person:tanaka:son_wife");
    const { id } = await createMemorialRequest(
      actor,
      tanakaInput({
        targets: [
          { personId: seed.get("person:tanaka:wife"), kaiki: 3 },
          { personId: seed.get("person:tanaka:father"), kaiki: 19 },
        ],
        seshuName: "田中 一郎の兄 田中 二郎",
      }),
      { today: TODAY },
    );
    const [row] = await db.select().from(memorialRequests).where(eq(memorialRequests.id, id));
    assert.equal(row.targets.length, 2);
    assert.equal(row.seshuPersonId, null);
    assert.equal(row.seshuName, "田中 一郎の兄 田中 二郎");
    assert.equal(row.requestedByPersonId, seed.get("person:tanaka:son_wife"));
  });

  it("ほかの家の人、ほかの家の故人、生きている人、ログインしていない操作者は申し込めない", async () => {
    await assert.rejects(createMemorialRequest(portal("person:yamada:head"), tanakaInput(), { today: TODAY }), isCode("forbidden"));
    await assert.rejects(
      createMemorialRequest(
        portal("person:tanaka:son"),
        tanakaInput({ targets: [{ personId: seed.get("person:yamada:father"), kaiki: 7 }] }),
        { today: TODAY },
      ),
      isCode("invalid"),
    );
    await assert.rejects(
      createMemorialRequest(
        portal("person:tanaka:son"),
        tanakaInput({ targets: [{ personId: seed.get("person:tanaka:head"), kaiki: 3 }] }),
        { today: TODAY },
      ),
      isCode("invalid"),
    );
    await assert.rejects(createMemorialRequest(staff, tanakaInput(), { today: TODAY }), isCode("forbidden"));
    await assert.rejects(
      createMemorialRequest(portal("person:tanaka:son"), tanakaInput({ seshuPersonId: seed.get("person:tanaka:head"), seshuName: "x" }), {
        today: TODAY,
      }),
      isCode("invalid"),
    );
    // 施主はこの世帯の生きている人
    await assert.rejects(
      createMemorialRequest(portal("person:tanaka:son"), tanakaInput({ seshuPersonId: seed.get("person:yamada:head") }), { today: TODAY }),
      isCode("invalid"),
    );
  });

  it("希望の時期は 1〜3 件。過ぎた日や、終わりが始まりより前の時期は受け付けない", async () => {
    const actor = portal("person:tanaka:son");
    const p = { from: "2027-04-01", to: "2027-04-02" };
    await assert.rejects(createMemorialRequest(actor, tanakaInput({ preferredPeriods: [] }), { today: TODAY }), /1 つ以上/);
    await assert.rejects(createMemorialRequest(actor, tanakaInput({ preferredPeriods: [p, p, p, p] }), { today: TODAY }), /3 つまで/);
    await assert.rejects(
      createMemorialRequest(actor, tanakaInput({ preferredPeriods: [{ from: "2027-04-05", to: "2027-04-01" }] }), { today: TODAY }),
      /始まりと同じか後/,
    );
    await assert.rejects(
      createMemorialRequest(actor, tanakaInput({ preferredPeriods: [{ from: "2026-10-01", to: "2026-10-02" }] }), { today: TODAY }),
      /過ぎた日/,
    );
    await assert.rejects(
      createMemorialRequest(actor, tanakaInput({ preferredPeriods: [{ from: "2027-4-1", to: "2027-04-02" }] }), { today: TODAY }),
      /YYYY-MM-DD/,
    );
    await assert.rejects(createMemorialRequest(actor, tanakaInput({ targets: [] }), { today: TODAY }), /1 人以上/);
    await assert.rejects(
      createMemorialRequest(actor, tanakaInput({ location: "church" as never }), { today: TODAY }),
      /お寺・自宅・墓前/,
    );
  });

  it("お断りには理由が必須。ポータルの一覧に「お断り」と理由が出る。2 回は断れない", async () => {
    const { id } = await createMemorialRequest(portal("person:tanaka:son"), tanakaInput(), { today: TODAY });
    await assert.rejects(declineMemorialRequest(staff, id, "  "), /理由/);
    await assert.rejects(declineMemorialRequest(portal("person:tanaka:son"), id, "x"), isCode("forbidden"));
    const r = await declineMemorialRequest(staff, id, "ご希望の日は本堂の改修工事のため、お受けできません");
    assert.equal(r.status, "declined");
    const [mine] = await listMemorialRequestsForHousehold(seed.get("household:tanaka"));
    assert.equal(mine.status, "declined");
    assert.equal(mine.declineReason, "ご希望の日は本堂の改修工事のため、お受けできません");
    await assert.rejects(declineMemorialRequest(staff, id, "もう一度"), isCode("conflict"));
  });
});

describe("回忌の提案（suggestKaiki）と家の法要の予定", () => {
  before(async () => {
    seed = await resetDb();
  });

  it("故人と年から回忌を提案する。年忌でない年は isMemorialKaiki = false", async () => {
    const wife = seed.get("person:tanaka:wife"); // 2025-04-12 没
    assert.deepEqual(await suggestKaiki(wife, 2027), { kaiki: 3, kaikiName: "三回忌", isMemorialKaiki: true });
    assert.deepEqual(await suggestKaiki(wife, 2026), { kaiki: 2, kaikiName: "一周忌", isMemorialKaiki: true });
    assert.deepEqual(await suggestKaiki(wife, 2028), { kaiki: 4, kaikiName: "四回忌", isMemorialKaiki: false });
    assert.deepEqual(await suggestKaiki(seed.get("person:yamada:father"), 2027), {
      kaiki: 7,
      kaikiName: "七回忌",
      isMemorialKaiki: true,
    });
    await assert.rejects(suggestKaiki(wife, 2024), /亡くなる前の年/);
    await assert.rejects(suggestKaiki(seed.get("person:tanaka:son"), 2027), /故人として登録されていません/);
    await assert.rejects(suggestKaiki("00000000-0000-0000-0000-000000000000", 2027), isCode("not_found"));
  });

  it("家の法要の予定: 今後の年忌の目安を祥月命日の順に返す（2027 年 和子 三回忌 など）", async () => {
    const s = await getHouseholdMemorialSchedule(seed.get("household:tanaka"), { today: TODAY });
    assert.deepEqual(s.confirmed, []);
    const first = s.upcoming[0];
    assert.deepEqual(
      { name: first.name, year: first.year, kaiki: first.kaiki, kaikiName: first.kaikiName, meinichi: first.meinichi },
      { name: "田中 和子", year: 2027, kaiki: 3, kaikiName: "三回忌", meinichi: "2027-04-12" },
    );
    assert.equal(first.homyo, "蓮華院日和信女");
    assert.equal(first.relation, "妻");
    // 3 年の内（2029-11-09 より前）だけ。祥月命日の順
    for (const u of s.upcoming) assert.ok(u.meinichi >= TODAY && u.meinichi < "2029-11-09", u.meinichi);
    const sorted = [...s.upcoming].sort((a, b) => a.meinichi.localeCompare(b.meinichi));
    assert.deepEqual(s.upcoming, sorted);
    // 山田家は 2027 年に七回忌と十三回忌
    const y = await getHouseholdMemorialSchedule(seed.get("household:yamada"), { today: TODAY, years: 1 });
    assert.deepEqual(
      y.upcoming.map((u) => `${u.name} ${u.kaikiName} ${u.meinichi}`),
      ["山田 清 三十七回忌 2026-12-05", "山田 太郎 七回忌 2027-03-24", "山田 キヨ 十三回忌 2027-08-10"],
    );
  });
});
