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

  it("場面 1: 「来月、年忌を迎えるお家を教えて」→ 回忌ごとの人数が返る（名前は返さず、管理画面の URL を添える）", async () => {
    const r = data(await runtime.call("list_upcoming_memorials", { from: "2026-12-01", to: "2026-12-31" }, ctx));
    const groups = r["回忌ごと"] as Obj[];
    assert.deepEqual(
      groups.map((g) => g["呼び名"]),
      ["一周忌", "三回忌", "七回忌", "十三回忌", "三十三回忌", "三十七回忌"],
    );
    assert.equal(r["合計"], 6);
    assert.match(r["管理画面"] as string, /\/admin\/ledger\/memorials\?from=2026-12-01&to=2026-12-31$/);
    const all: Obj[] = groups.flatMap((g) => (g["故人"] as Obj[]).map((p): Obj => ({ ...p, 呼び名: g["呼び名"] })));
    const ids = all.map((p) => p["person_id"]);
    assert.ok(ids.includes(seed.get("person:yamada:grandfather")));
    // 名前（家、窓口、俗名、法号）は返さない
    const json = JSON.stringify(r);
    for (const n of ["山田家", "佐藤家", "佐藤 茂", "法華院日茂信士", "佐藤 誠"]) assert.ok(!json.includes(n), n);
    // 続柄と祥月命日と目印は返す
    const sato = all.find((p) => p["person_id"] === seed.get("person:sato:father"))!;
    assert.equal(sato["続柄"], "父");
    assert.equal(sato["祥月命日"], "2026-12-18");
    assert.equal(sato["祥月命日を過ぎた"], false);
    assert.equal(sato["household_id"], seed.get("household:sato"));
    // 同じ世帯の、同じ年の年忌（複数霊位供養の候補）
    assert.deepEqual(
      (sato["同じ年に年忌を迎える家族"] as Obj[]).map((o) => `${o["person_id"] === seed.get("person:sato:mother")} ${o["呼び名"]}`),
      ["true 三回忌"],
    );
    // 11/30（中村家）と 1/3（小林家）は入らない。離檀（加藤家）と八回忌（吉田家）も入らない
    for (const k of ["person:nakamura:father", "person:kobayashi:mother", "person:kato:father"]) {
      assert.ok(!ids.includes(seed.get(k)), k);
    }
    // 監査ログに残る
    const [log] = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(1);
    assert.equal(log.action, "list_upcoming_memorials");
    assert.equal(log.result, "ok");
  });

  it("「今年、三回忌の家は？」→ 回忌で絞り、祥月命日を過ぎた方に印をつける", async () => {
    const r = data(await runtime.call("list_upcoming_memorials", { from: "2026-01-01", to: "2026-12-31", kaiki: 3 }, ctx));
    const groups = r["回忌ごと"] as Obj[];
    assert.deepEqual(groups.map((g) => g["呼び名"]), ["三回忌"]);
    assert.match(r["管理画面"] as string, /&kaiki=3$/);
    const items = groups[0]["故人"] as Obj[];
    const kimi = items.find((p) => p["person_id"] === seed.get("person:sato:mother"))!;
    assert.equal(kimi["祥月命日を過ぎた"], false);
    // 撮影の日（11/9）より前の祥月命日は、過ぎた印がつく
    assert.ok(items.some((p) => p["祥月命日"] as string < "2026-11-09" && p["祥月命日を過ぎた"] === true));
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
    // 1. 田中家を探す（1 世帯に決まる。検索語と合うので家の名前は返る）
    const found = data(await runtime.call("search_households", { query: "田中" }, ctx));
    const list = found["世帯"] as Obj[];
    assert.equal(list.length, 1);
    assert.equal(list[0]["名前"], "田中家");
    const householdId = list[0]["household_id"] as string;
    assert.equal(householdId, seed.get("household:tanaka"));

    // 2. 三回忌の故人を確かめる（get_household の次の年忌）。名前は返さず、続柄で指す
    const h = data(await runtime.call("get_household", { household_id: householdId }, ctx));
    const wife = (h["故人"] as Obj[]).find((d) => d["person_id"] === seed.get("person:tanaka:wife"))!;
    assert.equal(wife["続柄"], "妻");
    assert.deepEqual(wife["次の年忌"], { 回忌: 3, 呼び名: "三回忌", 年: 2027, 祥月命日: "2027-04-12" });
    assert.equal(h["窓口"], "長男");
    assert.equal(h["世帯主"], "世帯主（本人）");
    const hjson = JSON.stringify(h);
    for (const n of ["田中家", "田中 和子", "田中 健一", "蓮華院日和信女"]) assert.ok(!hjson.includes(n), n);

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
    // ID で呼ぶので、プレビューに家の名前は入らない（町名で示す）
    assert.match(p.preview as string, /武蔵野市栄町の世帯に対応記録を追加します/);
    assert.ok(!(p.preview as string).includes("田中家"));
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
    // 本文は LLM に返さない（日時、種類、記録者だけ。本文は管理画面で見る）
    const latest = (h2["直近の対応記録"] as Obj[])[0];
    assert.equal(latest["種類"], "案内");
    assert.equal(latest["記録者"], "高橋 日照");
    assert.equal(latest["内容"], undefined);
    assert.match(h2["管理画面"] as string, new RegExp(`/admin/ledger/households/${householdId}$`));
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

  it("場面 0 の下準備: 山田さんのお父さんを探すと、候補が複数返る（町名・続柄・没年で見分ける。俗名と法号は返さない）", async () => {
    const r = data(await runtime.call("search_deceased", { name: "山田", relation: "父" }, ctx));
    const list = r["候補"] as Obj[];
    assert.ok(list.length >= 2);
    assert.ok(r["注意"]);
    for (const c of list) {
      assert.equal(c["法号"], undefined);
      assert.equal(c["俗名"], undefined);
      assert.ok(c["没年"]);
      assert.match(c["続柄"] as string, /父/);
    }
    const taro = list.find((c) => c["person_id"] === seed.get("person:yamada:father"))!;
    assert.equal((taro["世帯"] as Obj)["呼び方"], "武蔵野市本町の山田家");
    assert.equal((taro["次の年忌"] as Obj)["呼び名"], "七回忌");
    // 法号で探したときは、家の名前は検索語に入っていないので返らない
    const byHomyo = data(await runtime.call("search_deceased", { homyo: "慈光院" }, ctx));
    assert.equal(((byHomyo["候補"] as Obj[])[0]["世帯"] as Obj)["呼び方"], "武蔵野市本町の世帯");
    assert.match(error(await runtime.call("search_deceased", {}, ctx)), /どれかを指定/);
  });

  it("search_households: 家の名前は検索語と合う家だけ返す。町名や電話番号で当たった家は件数と ID だけ", async () => {
    const town = data(await runtime.call("search_households", { query: "本町" }, ctx));
    assert.deepEqual(town["世帯"], []);
    const hidden = town["名前を伏せた世帯"] as Obj;
    assert.ok((hidden["件数"] as number) >= 1);
    assert.ok((hidden["household_id"] as string[]).includes(seed.get("household:yamada")));
    assert.match(town["管理画面"] as string, /\/admin\/ledger\?q=/);
    assert.ok(!JSON.stringify(town).includes("山田家"));

    const phone = data(await runtime.call("search_households", { query: "0422-55-0101" }, ctx));
    assert.equal(phone["件数"], 1);
    assert.deepEqual(phone["世帯"], []);
    assert.ok(!/家"/.test(JSON.stringify(phone)));

    // 同じ名字の家は 2 軒とも名前と町名が返る
    const yamada = data(await runtime.call("search_households", { query: "山田" }, ctx));
    assert.deepEqual(
      (yamada["世帯"] as Obj[]).map((h) => `${h["地域"]} ${h["名前"]}`).sort(),
      ["武蔵野市北町 山田家", "武蔵野市本町 山田家"],
    );
  });
});
