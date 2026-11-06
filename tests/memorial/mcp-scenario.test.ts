// 台本の場面 0（電話で受けた年忌法要）と場面 5 の後半（ポータルの申し込みを確定する）を、
// MCP のツールの呼び出し（ToolRuntime）で確かめる。シードを入れた状態で、Claude が呼ぶはずのツールを順に呼ぶ。
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { memorialRequests, memorialServices, memorialServiceTargets, reservations, staffEvents } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { getCalendar } from "@/domain/calendar";
import { getStaffById, jst, jstTimeString, staffActor } from "@/domain/core";
import { createMemorialRequest, getHouseholdMemorialSchedule, listMemorialRequestsForHousehold } from "@/domain/memorial";
import type { ToolContext } from "@/mcp/framework/define";
import { ToolRuntime, type ToolResult } from "@/mcp/framework/runtime";
import { allTools } from "@/mcp/tools";
import { resetDb } from "../helpers/db";

// 撮影の日（2026-11-09 10:00 日本時間）
const NOW = new Date("2026-11-09T01:00:00Z");

let seed: SeedContext;
let runtime: ToolRuntime;
let ctx: ToolContext;

type Obj = Record<string, unknown>;
function data(r: ToolResult): Obj {
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  return (r as { data: Obj }).data;
}
function error(r: ToolResult): string {
  assert.equal(r.ok, false);
  return (r as { error: string }).error;
}

type Day = { 日付: string; 祥月命日より前: boolean | null; 時刻: { 開始: string; 終了: string; 担当できる人: string[] }[] };

after(async () => {
  await closeDb();
});

describe("台本の場面 0（MCP）: 山田さんのお父さんの七回忌を 3 月に", () => {
  beforeEach(async () => {
    seed = await resetDb();
    runtime = new ToolRuntime(allTools);
    const jushoku = (await getStaffById(seed.get("staff:jushoku")))!;
    ctx = { actor: { ...staffActor(jushoku, "mcp"), staffId: jushoku.id }, now: NOW };
  });

  it("故人の確認 → 検証 → 候補 → 「3/15 の 10 時、住職の担当で」→ プレビュー → 了承 → まとめて登録される", async () => {
    // 0. ツールがそろっている（spec §4 の名前）
    const names = runtime.list().map((t) => t.name);
    for (const n of ["verify_memorial", "find_memorial_slots", "list_memorial_requests", "book_memorial_service", "decline_memorial_request"]) {
      assert.ok(names.includes(n), n);
    }

    // 1. 故人の特定: 「山田」「父」→ 本町の太郎さんと北町の太一さんが並ぶ（自動で決めない）
    const v1 = data(
      await runtime.call(
        "verify_memorial",
        { name: "山田", relation: "父", kaiki: 7, preferred_from: "2027-03-01", preferred_to: "2027-03-31" },
        ctx,
      ),
    );
    assert.equal(v1.status, "要確認");
    const cands = v1["候補"] as Obj[];
    assert.equal(cands.length, 2);
    const taro = cands.find((c) => c["俗名"] === "山田 太郎")!;
    const taichi = cands.find((c) => c["俗名"] === "山田 太一")!;
    assert.equal(taro["法号"], "慈光院日太信士");
    assert.equal(taro["没年"], 2021);
    assert.equal(taro["希望の年の回忌"], "2027 年は七回忌");
    assert.equal(taichi["法号"], "慈雲院日一信士");
    assert.equal(taichi["希望の年の回忌"], "2027 年は十回忌（年忌ではない）");
    assert.match(v1["次にすること"] as string, /住職に伝え/);

    // 2. 住職「本町の山田さん」→ person_id で呼び直す: 七回忌、祥月命日 3/24、キヨさんの十三回忌（複数霊位供養の提案）
    const v2 = data(
      await runtime.call(
        "verify_memorial",
        { person_id: taro.person_id, kaiki: 7, preferred_from: "2027-03-01", preferred_to: "2027-03-31" },
        ctx,
      ),
    );
    assert.equal(v2.status, "確認済み");
    assert.equal(v2["呼び名"], "七回忌");
    assert.equal(v2["祥月命日"], "2027-03-24（水）");
    const checks = v2["チェック"] as Record<string, Obj>;
    assert.equal(checks["2_回忌と年"]["結果"], "OK");
    assert.match(checks["3_祥月命日"]["内容"] as string, /3\/24/);
    assert.equal(checks["4_複数霊位供養"]["結果"], "提案あり");
    assert.match(checks["4_複数霊位供養"]["内容"] as string, /山田 キヨ.*十三回忌.*複数霊位供養/);
    const joint = v2["複数霊位供養の候補"] as Obj[];
    assert.equal(joint.length, 1);
    const kiyo = joint[0];
    assert.equal(kiyo["俗名"], "山田 キヨ");
    assert.equal(kiyo["回忌"], 13);
    const householdId = (v2["故人"] as Obj)["世帯"] as Obj;
    assert.equal(householdId.household_id, seed.get("household:yamada"));

    // 3. 候補（担当者×本堂）: 3 月のまるごとを調べても 3/15 が入り、10 時は住職だけが空いている
    const slots = data(
      await runtime.call(
        "find_memorial_slots",
        { from: "2027-03-01", to: "2027-03-31", person_ids: [taro.person_id, kiyo.person_id], location: "temple" },
        ctx,
      ),
    );
    assert.equal(slots["注意"], undefined);
    const days = slots["候補"] as Day[];
    const d15 = days.find((d) => d["日付"] === "2027-03-15（月）")!;
    assert.ok(d15, "3/15 が候補に入る");
    assert.equal(d15["祥月命日より前"], true);
    assert.deepEqual(
      d15["時刻"].map((t) => `${t["開始"]} ${t["担当できる人"].join("・")}`),
      [
        "10:00 住職 高橋 日照",
        "11:00 住職 高橋 日照",
        "12:00 住職 高橋 日照・副住職 高橋 日明",
        "13:00 副住職 高橋 日明・執事長 佐藤 隆",
      ],
    );
    // 命日（3/24）より後の日は後ろに並ぶ
    const idxAfter = days.findIndex((d) => d["祥月命日より前"] === false);
    assert.ok(idxAfter > days.indexOf(d15));
    assert.ok((slots["条件"] as Obj)["押さえ方"]);
    assert.deepEqual(slots["祥月命日"], ["山田 太郎: 2027-03-24（水）", "山田 キヨ: 2027-08-10（火）"]);

    // 4. 住職「3/15 の 10 時、住職の担当で。キヨさんもあわせて」→ プレビュー（まだ登録しない）
    const bookArgs = {
      household_id: seed.get("household:yamada"),
      targets: [
        { person_id: taro.person_id, kaiki: 7 },
        { person_id: kiyo.person_id, kaiki: 13 },
      ],
      date: "2027-03-15",
      time: "10:00",
      officiant: "住職",
      location: "temple",
    };
    const before = (await db.select().from(memorialServices)).length;
    const p = data(await runtime.call("book_memorial_service", bookArgs, ctx));
    assert.equal(p.status, "needs_confirmation");
    const preview = p.preview as string;
    assert.match(preview, /山田家/);
    assert.match(preview, /七回忌/);
    assert.match(preview, /十三回忌/);
    assert.match(preview, /複数霊位供養/);
    assert.match(preview, /2027-03-15（月）10:00〜10:40/);
    assert.match(preview, /法要の担当者: 住職 高橋 日照/);
    assert.match(preview, /担当者の予定:.*09:50〜10:50/);
    assert.match(preview, /本堂の予約: 2027-03-15（月）09:50〜10:50 を確定で押さえます/);
    assert.match(preview, /電話の受付として、申し込み（確定）を新しく記録します/);
    assert.match(preview, /施主: 山田 健/);
    assert.doesNotMatch(preview, /導師|戒名/);
    assert.equal((await db.select().from(memorialServices)).length, before);

    // 5. 住職が了承 → confirm_action
    const done = data(await runtime.call("confirm_action", { confirmation_id: p.confirmation_id }, ctx));
    assert.equal(done.status, "done");
    const result = done.result as Obj;
    const serviceId = (result["法要"] as Obj).memorial_service_id as string;
    assert.match(result["管理画面"] as string, new RegExp(`/admin/memorial/services/${serviceId}$`));

    // 法要と、故人ごとの回忌
    const [svc] = await db.select().from(memorialServices).where(eq(memorialServices.id, serviceId));
    assert.equal(svc.householdId, seed.get("household:yamada"));
    assert.equal(svc.officiantStaffId, seed.get("staff:jushoku"));
    assert.equal(svc.startAt.getTime(), jst("2027-03-15", "10:00").getTime());
    assert.equal(svc.location, "temple");
    assert.equal(svc.status, "scheduled");
    const targets = await db.select().from(memorialServiceTargets).where(eq(memorialServiceTargets.memorialServiceId, serviceId));
    assert.deepEqual(
      targets.map((t) => `${t.personId === taro.person_id ? "太郎" : "キヨ"}:${t.kaiki}`).sort(),
      ["キヨ:13", "太郎:7"],
    );
    // 担当者の予定（法要の業務の予定。前後 10 分を含む）
    const [ev] = await db.select().from(staffEvents).where(eq(staffEvents.memorialServiceId, serviceId));
    assert.equal(ev.category, "法要");
    assert.equal(ev.visibility, "shared");
    assert.equal(`${jstTimeString(ev.startAt)}〜${jstTimeString(ev.endAt)}`, "09:50〜10:50");
    // 本堂の予約（確定）
    const [res] = await db.select().from(reservations).where(eq(reservations.memorialServiceId, serviceId));
    assert.equal(res.kind, "memorial");
    assert.equal(res.status, "confirmed");
    assert.equal(res.facilityId, seed.get("facility:hondo"));
    assert.equal(`${jstTimeString(res.startAt)}〜${jstTimeString(res.endAt)}`, "09:50〜10:50");
    // 電話の申し込み（確定）
    const [req] = await db.select().from(memorialRequests).where(eq(memorialRequests.memorialServiceId, serviceId));
    assert.equal(req.source, "phone");
    assert.equal(req.status, "scheduled");
    assert.equal(req.staffId, seed.get("staff:jushoku"));

    // 管理画面のカレンダー（日表示）に出る
    const cal = await getCalendar(ctx.actor, { from: jst("2027-03-15"), to: jst("2027-03-16") });
    assert.ok(cal.events.some((e) => e.kind === "detail" && e.memorialServiceId === serviceId && e.category === "法要"));

    // 同じ確認はもう実行できず、同じ法要をもう一度プレビューすると止まる
    assert.match(error(await runtime.call("confirm_action", { confirmation_id: p.confirmation_id }, ctx)), /実行済み/);
    assert.match(error(await runtime.call("book_memorial_service", bookArgs, ctx)), /住職 高橋 日照は|すでに/);
  });

  it("自宅・墓前では移動時間を尋ねるように、移動時間がなければエラーを返す。担当者でない人は選べない", async () => {
    const args = {
      household_id: seed.get("household:yamada"),
      targets: [{ person_id: seed.get("person:yamada:father"), kaiki: 7 }],
      date: "2027-03-15",
      time: "10:00",
      officiant: "住職",
      location: "home",
    };
    assert.match(error(await runtime.call("book_memorial_service", args, ctx)), /移動時間.*住職に尋ねて/);
    assert.match(
      error(await runtime.call("find_memorial_slots", { from: "2027-03-15", to: "2027-03-15", location: "grave" }, ctx)),
      /移動時間/,
    );
    const ok = data(await runtime.call("book_memorial_service", { ...args, travel_before_min: 20, travel_after_min: 20 }, ctx));
    assert.match(ok.preview as string, /本堂の予約: なし/);
    assert.match(ok.preview as string, /行き 20 分・帰り 20 分/);
    assert.match(error(await runtime.call("book_memorial_service", { ...args, location: "temple", officiant: "奥様" }, ctx)), /法要の担当者にできるのは/);
    // 回忌が食い違えば、プレビューに注意が出る
    const warn = data(
      await runtime.call("book_memorial_service", { ...args, location: "temple", targets: [{ person_id: seed.get("person:yamada:father"), kaiki: 3 }] }, ctx),
    );
    assert.match(warn.preview as string, /【注意】山田 太郎さんの三回忌は 2023 年/);
  });
});

describe("台本の場面 5 の後半（MCP）: 新しい法要の申し込みはある？", () => {
  beforeEach(async () => {
    seed = await resetDb();
    runtime = new ToolRuntime(allTools);
    const jushoku = (await getStaffById(seed.get("staff:jushoku")))!;
    ctx = { actor: { ...staffActor(jushoku, "mcp"), staffId: jushoku.id }, now: NOW };
  });

  it("田中さんのポータルの申し込み → 一覧 → 候補 → 確定 → ポータルに確定した予定が出る", async () => {
    // 田中家の窓口（健一さん）がポータルから申し込む
    const tanaka = seed.get("household:tanaka");
    const { id } = await createMemorialRequest(
      { templeId: seed.templeId, channel: "portal", personId: seed.get("person:tanaka:son"), label: "portal:田中 健一" },
      {
        householdId: tanaka,
        targets: [{ personId: seed.get("person:tanaka:wife"), kaiki: 3 }],
        preferredPeriods: [{ from: "2027-04-03", to: "2027-04-11", note: "土日を希望" }],
        location: "temple",
        attendees: 8,
        otoki: true,
      },
      { today: "2026-11-09" },
    );

    // 1. 「新しい法要の申し込みはある？」→ 受付済みの一覧（シードの 2 件と田中家）
    const list = data(await runtime.call("list_memorial_requests", {}, ctx));
    const reqs = list["申し込み"] as Obj[];
    assert.ok(reqs.length >= 2);
    for (const r of reqs) assert.equal(r["状態"], "受付済み");
    const mine = reqs.find((r) => r.memorial_request_id === id)!;
    assert.equal((mine["世帯"] as Obj)["名前"], "田中家");
    assert.equal(mine["経路"], "ポータル");
    assert.equal(mine["申し込んだ人"], "田中 健一");
    assert.deepEqual(
      (mine["故人"] as Obj[]).map((t) => `${t["俗名"]} ${t["呼び名"]}`),
      ["田中 和子 三回忌"],
    );
    assert.equal(mine["参列の人数"], 8);
    assert.equal(mine["お斎"], "あり");
    assert.match((mine["希望の時期"] as string[])[0], /第 1 希望: 2027-04-03（土）〜2027-04-11（日）（土日を希望）/);

    // 2. 候補（申し込みの希望の時期・場所・故人を使う）
    const slots = data(await runtime.call("find_memorial_slots", { memorial_request_id: id }, ctx));
    const days = slots["候補"] as Day[];
    assert.equal(days[0]["日付"], "2027-04-03（土）");
    assert.equal(days[0]["祥月命日より前"], true);
    assert.deepEqual(slots["祥月命日"], ["田中 和子: 2027-04-12（月）"]);

    // 3. 住職「4/3 の 11 時、副住職で」→ プレビュー → 了承
    const p = data(
      await runtime.call("book_memorial_service", { memorial_request_id: id, date: "2027-04-03", time: "11:00", officiant: "副住職" }, ctx),
    );
    assert.match(p.preview as string, /ポータルで .* に受けた申し込み（田中 健一さん）を「確定」にして/);
    assert.match(p.preview as string, /田中家/);
    assert.match(p.preview as string, /本堂の予約: 2027-04-03（土）10:50〜11:50/);
    const done = data(await runtime.call("confirm_action", { confirmation_id: p.confirmation_id }, ctx));
    assert.equal(((done.result as Obj)["申し込み"] as Obj).memorial_request_id, id);

    // 4. ポータルに確定した予定が出る（申し込みの状況と、家の法要の予定）
    const [portalReq] = await listMemorialRequestsForHousehold(tanaka);
    assert.equal(portalReq.status, "scheduled");
    assert.equal(portalReq.service?.officiantName, "副住職 高橋 日明");
    const sch = await getHouseholdMemorialSchedule(tanaka, { today: "2026-11-09" });
    assert.equal(sch.confirmed.length, 1);
    assert.equal(sch.confirmed[0].targets[0].kaikiName, "三回忌");
    assert.ok(!sch.upcoming.some((u) => u.name === "田中 和子" && u.kaiki === 3));

    // 5. 受付済みの一覧から消える
    const list2 = data(await runtime.call("list_memorial_requests", {}, ctx));
    assert.ok(!(list2["申し込み"] as Obj[]).some((r) => r.memorial_request_id === id));
  });

  it("申し込みを理由を添えて断る（decline_memorial_request）。理由がなければエラー", async () => {
    const list = data(await runtime.call("list_memorial_requests", {}, ctx));
    const target = (list["申し込み"] as Obj[]).find((r) => (r["世帯"] as Obj)["名前"] === "井上家")!;
    const rid = target.memorial_request_id as string;
    assert.match(error(await runtime.call("decline_memorial_request", { memorial_request_id: rid, reason: "" }, ctx)), /引数/);
    const p = data(
      await runtime.call("decline_memorial_request", { memorial_request_id: rid, reason: "その時期は本山の行事で、お伺いできません" }, ctx),
    );
    assert.match(p.preview as string, /井上家/);
    assert.match(p.preview as string, /ポータルに表示されます/);
    data(await runtime.call("confirm_action", { confirmation_id: p.confirmation_id }, ctx));
    const [row] = await db.select().from(memorialRequests).where(eq(memorialRequests.id, rid));
    assert.equal(row.status, "declined");
    assert.equal(row.declineReason, "その時期は本山の行事で、お伺いできません");
    assert.match(error(await runtime.call("decline_memorial_request", { memorial_request_id: rid, reason: "x" }, ctx)), /お断りできません/);
  });
});
