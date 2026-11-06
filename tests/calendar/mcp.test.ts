// カレンダーの MCP ツールのテスト（ToolRuntime で呼ぶ）。シードの予定と混ざらないように、2028 年の予定で確かめる
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { staffEventAssignees, staffEvents } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { createPrivateEvent } from "@/domain/calendar";
import { getStaffById, jst, staffActor } from "@/domain/core";
import type { ToolContext } from "@/mcp/framework/define";
import { ToolRuntime, type ToolResult } from "@/mcp/framework/runtime";
import { allTools } from "@/mcp/tools";
import { resetDb } from "../helpers/db";

const NOW = new Date("2026-11-06T01:00:00Z");
const SECRET_TITLE = "副住職の秘密の通院ABC";
const SECRET_BODY = "胃カメラXYZ";
const MY_SECRET = "住職の私用メモQRS";
const DAY = "2028-05-10";

let seed: SeedContext;
let runtime: ToolRuntime;
let ctx: ToolContext;

function data(r: ToolResult): Record<string, unknown> {
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  return (r as { data: Record<string, unknown> }).data;
}

async function ctxOf(key: string): Promise<ToolContext> {
  const s = (await getStaffById(seed.get(key)))!;
  return { actor: { ...staffActor(s, "mcp"), staffId: s.id }, now: NOW };
}

describe("カレンダーの MCP ツール", () => {
  beforeEach(async () => {
    seed = await resetDb();
    runtime = new ToolRuntime(allTools);
    ctx = await ctxOf("staff:jushoku");
    const fuku = await ctxOf("staff:fukujushoku");
    await createPrivateEvent(fuku.actor, {
      title: SECRET_TITLE,
      body: SECRET_BODY,
      start: jst(DAY, "10:00"),
      end: jst(DAY, "11:30"),
    });
    await createPrivateEvent(ctx.actor, { title: MY_SECRET, start: jst(DAY, "14:00"), end: jst(DAY, "15:00") });
  });
  after(async () => {
    await closeDb();
  });

  it("get_staff_calendar: 他人の私的な予定は「予定あり」と時間だけ。自分の私的な予定は内容つき", async () => {
    const d = data(await runtime.call("get_staff_calendar", { from: DAY }, ctx));
    const json = JSON.stringify(d);
    assert.ok(!json.includes(SECRET_TITLE), "他人の私的な予定のタイトルが漏れている");
    assert.ok(!json.includes(SECRET_BODY), "他人の私的な予定の内容が漏れている");
    assert.ok(json.includes(MY_SECRET), "自分の私的な予定は内容まで返す");
    const events = d.events as Record<string, unknown>[];
    const busy = events.find((e) => e["内容"] === "予定あり")!;
    assert.equal(busy["時間"], "10:00〜11:30");
    assert.deepEqual(busy["スタッフ"], ["副住職 高橋 日明"]);
    assert.equal(busy["タイトル"], undefined);
  });

  it("get_staff_calendar: 副住職が操作者なら、副住職の予定の内容が返り、住職の私的な予定は返らない", async () => {
    const fuku = await ctxOf("staff:fukujushoku");
    const json = JSON.stringify(data(await runtime.call("get_staff_calendar", { from: DAY, staff: ["住職", "副住職"] }, fuku)));
    assert.ok(json.includes(SECRET_TITLE));
    assert.ok(!json.includes(MY_SECRET));
  });

  it("check_staff_availability: 私的な予定も埋まっている時間に入り、内容は返らない", async () => {
    const d = data(await runtime.call("check_staff_availability", { from: DAY, day_start: "09:00", day_end: "17:00" }, ctx));
    const json = JSON.stringify(d);
    assert.ok(!json.includes(SECRET_TITLE) && !json.includes(SECRET_BODY) && !json.includes(MY_SECRET));
    const staff = d.staff as { role: string; days: Record<string, string[]>[] }[];
    assert.deepEqual(
      staff.map((s) => s.role),
      ["住職", "副住職", "執事長"],
      "省略すると法要の担当者",
    );
    assert.deepEqual(staff[1].days[0]["空いている時間"], ["09:00〜10:00", "11:30〜17:00"]);
    assert.deepEqual(staff[0].days[0]["埋まっている時間"], ["14:00〜15:00"]);
  });

  it("check_staff_availability: 知らないスタッフや逆さまの期間はエラー", async () => {
    const r1 = await runtime.call("check_staff_availability", { from: DAY, staff: ["山田"] }, ctx);
    assert.equal(r1.ok, false);
    const r0 = await runtime.call(
      "create_staff_event",
      { title: "x", category: "法要", start: `${DAY} 10:00`, end: `${DAY} 11:00`, assignees: ["住職"] },
      ctx,
    );
    assert.equal(r0.ok, false, "法要の予定は book_memorial_service で作る");
    const r2 = await runtime.call("check_staff_availability", { from: DAY, to: "2028-05-01" }, ctx);
    assert.equal(r2.ok, false);
  });

  it("create_staff_event → confirm_action で業務の予定が登録される（プレビューの時点では登録しない）", async () => {
    const before = (await db.select().from(staffEvents)).length;
    const p = data(
      await runtime.call(
        "create_staff_event",
        {
          title: "檀信徒総会の準備",
          category: "行事",
          start: `${DAY} 10:30`,
          end: `${DAY} 12:00`,
          assignees: ["副住職", "アルバイト"],
          body: "椅子を並べる",
        },
        ctx,
      ),
    );
    assert.equal(p.status, "needs_confirmation");
    const preview = String(p.preview);
    assert.match(preview, /檀信徒総会の準備/);
    assert.match(preview, /副住職 高橋 日明、アルバイト 小林 葵/);
    assert.match(preview, /副住職 高橋 日明 は、この時間に別の予定があります/);
    assert.ok(!preview.includes(SECRET_TITLE), "重なりの警告に私的な予定の内容を出さない");
    assert.equal((await db.select().from(staffEvents)).length, before, "プレビューでは登録しない");

    const done = data(await runtime.call("confirm_action", { confirmation_id: p.confirmation_id }, ctx));
    assert.equal(done.status, "done");
    const id = (done.result as { id: string }).id;
    const [row] = await db.select().from(staffEvents).where(eq(staffEvents.id, id));
    assert.equal(row.visibility, "shared");
    assert.equal(row.title, "檀信徒総会の準備");
    assert.equal(row.ownerStaffId, seed.get("staff:jushoku"));
    const assignees = await db.select().from(staffEventAssignees).where(eq(staffEventAssignees.staffEventId, id));
    assert.deepEqual(
      assignees.map((a) => a.staffId).sort(),
      [seed.get("staff:fukujushoku"), seed.get("staff:baito")].sort(),
    );
  });

  it("create_staff_event: 私用（私的な予定）と法要のカテゴリは作れない。終わりが始まりより前もエラー", async () => {
    const r1 = await runtime.call(
      "create_staff_event",
      { title: "x", category: "私用", start: `${DAY} 10:00`, end: `${DAY} 11:00`, assignees: ["住職"] },
      ctx,
    );
    assert.equal(r1.ok, false);
    const r2 = await runtime.call(
      "create_staff_event",
      { title: "x", category: "外出", start: `${DAY} 10:00`, end: `${DAY} 09:00`, assignees: ["住職"] },
      ctx,
    );
    assert.equal(r2.ok, false);
    assert.match((r2 as { error: string }).error, /終わり/);
  });
});
