// 台本の場面 1 と 2 を、MCP のツールの呼び出し（ToolRuntime）で確かめる。
// Claude Desktop で住職が話したときに、Claude が呼ぶはずのツールを順に呼ぶ。
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { desc, eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { auditLogs, contactLogs } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { getStaffById, staffActor } from "@/domain/core";
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

describe("台本の場面 1、2（MCP）", () => {
  beforeEach(async () => {
    seed = await resetDb();
    runtime = new ToolRuntime(allTools);
    const jushoku = (await getStaffById(seed.get("staff:jushoku")))!;
    ctx = { actor: { ...staffActor(jushoku, "mcp"), staffId: jushoku.id }, now: NOW };
  });
  after(async () => {
    await closeDb();
  });

  it("場面 1: 「来月、年忌を迎えるお家を教えて」→ 回忌ごとに一覧が返る", async () => {
    const r = data(await runtime.call("list_upcoming_memorials", { from: "2026-12-01", to: "2026-12-31" }, ctx));
    const groups = r["回忌ごと"] as Obj[];
    assert.deepEqual(
      groups.map((g) => g["呼び名"]),
      ["一周忌", "三回忌", "七回忌", "十三回忌", "三十三回忌", "三十七回忌"],
    );
    assert.equal(r["合計"], 6);
    const all: Obj[] = groups.flatMap((g) => (g["故人"] as Obj[]).map((p): Obj => ({ ...p, 呼び名: g["呼び名"] })));
    const names = all.map((p) => `${(p["世帯"] as Obj)["名前"]} ${p["俗名"]} ${p["呼び名"]}`);
    assert.ok(names.includes("山田家 山田 清 三十七回忌"));
    assert.ok(names.includes("佐藤家 佐藤 茂 七回忌"));
    // 法号と祥月命日が入っている
    const sato = all.find((p) => p["俗名"] === "佐藤 茂")!;
    assert.equal(sato["法号"], "法華院日茂信士");
    assert.equal(sato["祥月命日"], "2026-12-18");
    // 同じ世帯の、同じ年の年忌（複数霊位供養の候補）
    assert.deepEqual(
      (sato["同じ年に年忌を迎える家族"] as Obj[]).map((o) => `${o["俗名"]} ${o["呼び名"]}`),
      ["佐藤 キミ 三回忌"],
    );
    // 11/30（中村家）と 1/3（小林家）は入らない。離檀（加藤家）と八回忌（吉田家）も入らない
    for (const n of ["中村 次郎", "小林 フミ", "加藤 正", "吉田 弘"]) {
      assert.ok(!all.some((p) => p["俗名"] === n), n);
    }
    // 監査ログに残る
    const [log] = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(1);
    assert.equal(log.action, "list_upcoming_memorials");
    assert.equal(log.result, "ok");
  });

  it("場面 1: 日付の形が正しくなければ、利用者向けのエラーを返す", async () => {
    assert.match(
      error(await runtime.call("list_upcoming_memorials", { from: "2026-12", to: "2026-12-31" }, ctx)),
      /日付は YYYY-MM-DD/,
    );
    assert.match(
      error(await runtime.call("list_upcoming_memorials", { from: "2026-12-31", to: "2026-12-01" }, ctx)),
      /始まりが終わりより後/,
    );
  });

  it("場面 2: 「田中家に三回忌のご案内をしたと記録しておいて」→ プレビュー → 了承 → 対応記録が追加される", async () => {
    // 1. 田中家を探す（1 世帯に決まる）
    const found = data(await runtime.call("search_households", { query: "田中" }, ctx));
    const list = found["世帯"] as Obj[];
    assert.equal(list.length, 1);
    const householdId = list[0]["household_id"] as string;
    assert.equal(householdId, seed.get("household:tanaka"));

    // 2. 三回忌の故人を確かめる（get_household の次の年忌）
    const h = data(await runtime.call("get_household", { household_id: householdId }, ctx));
    const wife = (h["故人"] as Obj[]).find((d) => d["俗名"] === "田中 和子")!;
    assert.deepEqual(wife["次の年忌"], { 回忌: 3, 呼び名: "三回忌", 年: 2027, 祥月命日: "2027-04-12" });
    assert.equal(h["窓口"], "田中 健一");

    // 3. 書き込みはプレビューだけ
    const before = await db.select().from(contactLogs).where(eq(contactLogs.householdId, householdId));
    const p = data(
      await runtime.call(
        "add_contact_log",
        { household_id: householdId, kind: "案内", body: "和子さんの三回忌（2027 年）のご案内をした" },
        ctx,
      ),
    );
    assert.equal(p.status, "needs_confirmation");
    assert.match(p.preview as string, /田中家/);
    assert.match(p.preview as string, /種類: 案内/);
    assert.match(p.preview as string, /三回忌/);
    assert.match(p.preview as string, /記録者: 住職 高橋 日照/);
    assert.equal((await db.select().from(contactLogs).where(eq(contactLogs.householdId, householdId))).length, before.length);

    // 4. 住職が了承 → confirm_action
    const done = data(await runtime.call("confirm_action", { confirmation_id: p.confirmation_id }, ctx));
    assert.equal(done.status, "done");
    const after = await db
      .select()
      .from(contactLogs)
      .where(eq(contactLogs.householdId, householdId))
      .orderBy(desc(contactLogs.createdAt));
    assert.equal(after.length, before.length + 1);
    assert.equal(after[0].kind, "案内");
    assert.equal(after[0].staffId, seed.get("staff:jushoku"));

    // 5. get_household の直近の対応記録に出る
    const h2 = data(await runtime.call("get_household", { household_id: householdId }, ctx));
    assert.equal((h2["直近の対応記録"] as Obj[])[0]["内容"], "和子さんの三回忌（2027 年）のご案内をした");
  });

  it("add_contact_log: 知らない世帯や、決まっていない種類はエラーにする", async () => {
    assert.match(
      error(
        await runtime.call(
          "add_contact_log",
          { household_id: "00000000-0000-0000-0000-000000000000", kind: "案内", body: "x" },
          ctx,
        ),
      ),
      /世帯が見つかりません/,
    );
    assert.match(
      error(await runtime.call("add_contact_log", { household_id: seed.get("household:tanaka"), kind: "メール", body: "x" }, ctx)),
      /引数が正しくありません/,
    );
  });

  it("場面 0 の下準備: 山田さんのお父さんを探すと、候補が複数返る（法号と没年つき）", async () => {
    const r = data(await runtime.call("search_deceased", { name: "山田", relation: "父" }, ctx));
    const list = r["候補"] as Obj[];
    assert.ok(list.length >= 2);
    assert.ok(r["注意"]);
    for (const c of list) {
      assert.ok(c["法号"]);
      assert.ok(c["没年"]);
    }
    const taro = list.find((c) => c["俗名"] === "山田 太郎")!;
    assert.equal((taro["次の年忌"] as Obj)["呼び名"], "七回忌");
    assert.match(error(await runtime.call("search_deceased", {}, ctx)), /どれかを指定/);
  });
});
