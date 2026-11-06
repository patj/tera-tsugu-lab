// 施設予約の MCP ツール（台本の場面 4: 申請 → 承認待ちの確認 → 承認 / お断り）
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { closeDb, db } from "@/db/client";
import type { SeedContext } from "@/db/seed/context";
import { getStaffById, jst, staffActor } from "@/domain/core";
import { createReservation, getAvailability, getPublicStatus, submitPublicApplication } from "@/domain/facility";
import type { ToolContext } from "@/mcp/framework/define";
import { ToolRuntime, type ToolResult } from "@/mcp/framework/runtime";
import { allTools } from "@/mcp/tools";
import { resetDb } from "../helpers/db";

// デモの撮影日（11/9）の 10:00
const NOW = new Date("2026-11-09T01:00:00Z");

let seed: SeedContext;
let rt: ToolRuntime;
let ctx: ToolContext;

type Item = Record<string, unknown> & { 申請番号: string; 状態: string; 重なりの確認?: Record<string, unknown> };

function data<T = Record<string, unknown>>(r: ToolResult): T {
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  return (r as { data: T }).data;
}
function error(r: ToolResult): string {
  assert.equal(r.ok, false);
  return (r as { error: string }).error;
}
async function confirm(r: ToolResult) {
  const { confirmation_id } = data<{ confirmation_id: string }>(r);
  return data<{ status: string; result: Item }>(await rt.call("confirm_action", { confirmation_id }, ctx));
}

/** 場面 4 の 2 件の申請（スマートフォンから） */
async function applyScene4() {
  const photo = await submitPublicApplication(
    {
      facilityId: seed.get("facility:hondo"),
      kind: "photo",
      date: "2026-12-06",
      period: "am",
      name: "青木 美咲",
      phone: "090-1234-5678",
      email: "aoki@example.com",
      notes: "結婚式の前撮り。和装で本堂の前で撮影したい",
    },
    NOW,
  );
  const tea = await submitPublicApplication(
    {
      facilityId: seed.get("facility:higashi"),
      kind: "tea",
      date: "2026-12-13",
      period: "pm",
      name: "茶道 和敬会 村田",
      phone: "03-1234-5678",
      notes: "12 名ほどのお茶会",
    },
    NOW,
  );
  return { photo: photo.requestCode, tea: tea.requestCode };
}

describe("施設予約の MCP ツール", () => {
  beforeEach(async () => {
    seed = await resetDb();
    rt = new ToolRuntime(allTools);
    const jushoku = (await getStaffById(seed.get("staff:jushoku")))!;
    ctx = { actor: { ...staffActor(jushoku, "mcp"), staffId: jushoku.id }, now: NOW };
  });
  after(async () => {
    await closeDb();
  });

  it("場面 4: 申請すると◯×が×になり、承認待ちに出て、法要と重ならないことを確かめて承認できる。もう 1 件はお断りする", async () => {
    const before = await getAvailability({ from: "2026-12-06", to: "2026-12-13" });
    const cell = (a: typeof before, name: string, date: string) =>
      a.facilities.find((f) => f.name === name)!.days.find((d) => d.date === date)!.available;
    assert.deepEqual(cell(before, "本堂", "2026-12-06"), { am: true, pm: false }, "シードでは 12/6 午前の本堂が空いている");
    assert.deepEqual(cell(before, "東席", "2026-12-13"), { am: false, pm: true }, "シードでは 12/13 午後の東席が空いている");

    const codes = await applyScene4();

    const after = await getAvailability({ from: "2026-12-06", to: "2026-12-13" });
    assert.deepEqual(cell(after, "本堂", "2026-12-06"), { am: false, pm: false });
    assert.deepEqual(cell(after, "東席", "2026-12-13"), { am: false, pm: false });

    // 「承認待ちの予約はある？」
    const list = data<{ 承認待ちの件数: number; 予約: Item[] }>(await rt.call("list_reservations", { status: "pending" }, ctx));
    assert.ok(list.予約.every((r) => r.状態 === "申請中"));
    const photo = list.予約.find((r) => r.申請番号 === codes.photo)!;
    const tea = list.予約.find((r) => r.申請番号 === codes.tea)!;
    assert.equal(photo.施設, "本堂");
    assert.equal(photo.日時, "2026-12-06（日）09:00〜12:00");
    assert.equal(photo.申請者, "青木 美咲");
    assert.equal(photo.電話, "090-1234-5678");
    assert.deepEqual(photo.重なりの確認, {
      同じ施設: "同じ施設の法要・予約とは重なりません",
      法要: "同じ時間の法要はありません",
      同じ時間のほかの施設の予約: [],
    });
    assert.equal(tea.種類, "茶会");

    // 承認 → プレビュー → 了承 → 確定
    const preview = await rt.call("approve_reservation", { request_code: codes.photo }, ctx);
    assert.match(data<{ preview: string }>(preview).preview, /承認して、確定にします[\s\S]*同じ施設の法要・予約とは重なりません/);
    assert.equal((await getPublicStatus(codes.photo))!.status, "pending", "了承の前は申請中のまま");
    const done = await confirm(preview);
    assert.equal(done.result.状態, "確定");
    assert.equal((await getPublicStatus(codes.photo))!.statusLabel, "確定");

    // お断り（理由が必須）
    assert.match(error(await rt.call("reject_reservation", { request_code: codes.tea, reason: " " }, ctx)), /引数が正しくありません/);
    const rejected = await confirm(
      await rt.call("reject_reservation", { request_code: codes.tea, reason: "その日は行事のため東席をお貸しできません" }, ctx),
    );
    assert.equal(rejected.result.状態, "お断り");
    const status = (await getPublicStatus(codes.tea))!;
    assert.equal(status.status, "rejected");
    assert.equal(status.rejectReason, "その日は行事のため東席をお貸しできません");

    // お断りした時間は、また空きになる
    assert.deepEqual(cell(await getAvailability({ from: "2026-12-13", to: "2026-12-13" }), "東席", "2026-12-13"), {
      am: false,
      pm: true,
    });

    // 承認待ちの一覧から消えている
    const again = data<{ 予約: Item[] }>(await rt.call("list_reservations", { status: "pending" }, ctx));
    assert.equal(again.予約.some((r) => r.申請番号 === codes.photo || r.申請番号 === codes.tea), false);
  });

  it("承認待ちと同じ時間の法要（ほかの施設）があれば、重なりの確認に出す", async () => {
    const { tea } = await applyScene4();
    const staff = ctx.actor;
    await createReservation(staff, db, {
      facilityId: seed.get("facility:hondo"),
      kind: "memorial",
      status: "confirmed",
      start: jst("2026-12-13", "13:50"),
      end: jst("2026-12-13", "14:50"),
      title: "テスト家 法要",
    });
    const list = data<{ 予約: Item[] }>(await rt.call("list_reservations", { status: "pending", facility: "東席" }, ctx));
    const item = list.予約.find((r) => r.申請番号 === tea)!;
    assert.deepEqual(item.重なりの確認!.法要, ["本堂 2026-12-13（日）13:50〜14:50 法要（確定） テスト家 法要"]);
  });

  it("申請中でない予約は承認もお断りもできない。知らない申請番号はエラー", async () => {
    const { photo } = await applyScene4();
    await confirm(await rt.call("approve_reservation", { request_code: photo }, ctx));
    assert.match(error(await rt.call("approve_reservation", { request_code: photo }, ctx)), /確定です/);
    assert.match(error(await rt.call("reject_reservation", { request_code: photo, reason: "x" }, ctx)), /確定です/);
    assert.match(error(await rt.call("approve_reservation", { request_code: "ZZZZ-ZZZZ" }, ctx)), /見つかりません/);
  });

  it("create_reservation: 確定の予約を登録する。重なる時間はプレビューで止める", async () => {
    const r = await rt.call(
      "create_reservation",
      {
        facility: "中席",
        kind: "tea",
        start: "2026-12-26 13:00",
        end: "16:00",
        title: "年忘れの茶会",
        contact_name: "佐藤 一郎",
        contact_phone: "090-0000-1111",
      },
      ctx,
    );
    assert.match(data<{ preview: string }>(r).preview, /中席[\s\S]*2026-12-26（土）13:00〜16:00[\s\S]*佐藤 一郎/);
    const done = await confirm(r);
    assert.equal(done.result.状態, "確定");
    assert.equal(done.result.申請者, "佐藤 一郎");
    assert.match(done.result.申請番号, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    assert.match(
      error(await rt.call("create_reservation", { facility: "中席", kind: "other", start: "2026-12-26 15:00", end: "2026-12-26 17:00" }, ctx)),
      /中席は、その時間に別の予約と重なります/,
    );
    assert.match(
      error(await rt.call("create_reservation", { facility: "講堂", kind: "other", start: "2026-12-26 15:00", end: "17:00" }, ctx)),
      /施設「講堂」が見つかりません/,
    );
  });

  it("確認待ちの間に同じ時間が埋まったら、実行の時点で conflict になる", async () => {
    const r = await rt.call("create_reservation", { facility: "西席", kind: "other", start: "2026-12-27 10:00", end: "12:00" }, ctx);
    await createReservation(ctx.actor, db, {
      facilityId: seed.get("facility:nishi"),
      kind: "tea",
      status: "pending",
      start: jst("2026-12-27", "11:00"),
      end: jst("2026-12-27", "13:00"),
    });
    const { confirmation_id } = data<{ confirmation_id: string }>(r);
    assert.match(error(await rt.call("confirm_action", { confirmation_id }, ctx)), /実行できませんでした: 西席は、その時間に別の予約と重なります/);
  });

  it("check_facility_availability: 日ごとの午前・午後の◯×と予約を返す", async () => {
    const a = data<{ 施設: { 施設: string; 日ごと: Record<string, unknown>[] }[] }>(
      await rt.call("check_facility_availability", { from: "2026-12-06", to: "2026-12-06" }, ctx),
    );
    assert.equal(a.施設.length, 5);
    const hondo = a.施設.find((f) => f.施設 === "本堂")!.日ごと[0];
    assert.equal(hondo.日付, "2026-12-06（日）");
    assert.equal(hondo.午前, "◯");
    assert.equal(hondo.午後, "×");
    assert.deepEqual(hondo.予約, ["2026-12-06（日）14:00〜16:00 前撮り撮影（確定） 石川様 前撮り"]);
  });
});
