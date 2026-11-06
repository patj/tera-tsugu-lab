// MCP のツールの結果とプレビュー（どちらも LLM に送られる）に、返さないと決めた情報が入らないことを確かめる（spec.md §4「LLM に渡す情報」）。
// シードの連絡先（住所の番地、電話、携帯、メール）、生年月日、自由記述（対応記録の本文、申し込みの連絡事項、施設の予約の件名と内容、台帳のメモ）、
// 檀家の名前（故人の俗名と法号、生きている家族の名前）、施設の予約の申請者の名前（伏せる前）、法要の予定の件名、
// フォームの回答の値（選択肢の文字は集計に出るので除く）を集め、
// 読み取りのツールと書き込みのツールのプレビューを一通り呼んで、どの文字列も結果に出てこないことを見る。
// ドメイン層が作る文（注意やチェックのメッセージ）から漏れる場合も、ここで見つかる。
// 家の名前は、その呼び出しの引数に家の名前（「家」を除いた部分）が入っていないときは、結果に入らないことを確かめる（call が毎回確かめる）。
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, db } from "@/db/client";
import { isNotNull } from "drizzle-orm";
import {
  contactLogs,
  contacts,
  formQuestions,
  formResponses,
  households,
  memorialRequests,
  persons,
  reservations,
  staffEvents,
} from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { getStaffById, staffActor } from "@/domain/core";
import type { ToolContext } from "@/mcp/framework/define";
import { areaOf } from "@/mcp/framework/present";
import { ToolRuntime, type ToolResult } from "@/mcp/framework/runtime";
import { allTools } from "@/mcp/tools";
import { resetDb } from "../helpers/db";

// 撮影の日（2026-11-09 10:00 日本時間）
const NOW = new Date("2026-11-09T01:00:00Z");

type Obj = Record<string, unknown>;

let seed: SeedContext;
let runtime: ToolRuntime;
let ctx: ToolContext;
/** [何の値か, 値] */
let secrets: [string, string][];
/** 世帯の名前（「山田家」） */
let householdNames: string[];

function data(r: ToolResult): Obj {
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  return (r as { data: Obj }).data;
}

const compact = (v: string) => v.replace(/[\s　]/g, "");

/** 引数に入っていない家の名前が、結果に入っていないこと */
function assertNoUnaskedHouseholdNames(label: string, args: Obj, out: unknown) {
  const asked = compact(JSON.stringify(args));
  const json = JSON.stringify(out);
  for (const name of householdNames) {
    if (asked.includes(name.replace(/家$/, ""))) continue;
    assert.ok(!json.includes(name), `${label} の結果に、引数にない家の名前が入っている: ${name}`);
  }
}

async function call(name: string, args: Obj): Promise<Obj> {
  const out = data(await runtime.call(name, args, ctx));
  assertNoUnaskedHouseholdNames(name, args, out);
  return out;
}

/** args: 住職が入力した引数。引数に入っている値（住職が言ったもの）は、結果に出てもよい */
function assertNoSecrets(label: string, out: unknown, args?: Obj) {
  const json = JSON.stringify(out);
  const given = args ? JSON.stringify(args) : "";
  for (const [what, value] of secrets) {
    if (given.includes(value)) continue;
    assert.ok(!json.includes(value), `${label} の結果に${what}が入っている: ${value}`);
  }
}

async function collectSecrets(): Promise<[string, string][]> {
  const list: [string, string | null][] = [];
  for (const h of await db.select().from(households)) {
    list.push(["世帯の住所（番地まで）", h.address]);
    if (h.address && areaOf(h.address) !== h.address) list.push(["世帯の住所（番地）", h.address.replace(/^.*?[都道府県]/, "")]);
    list.push(["世帯の電話", h.phone], ["世帯のメモ", h.notes]);
  }
  for (const p of await db.select().from(persons)) {
    list.push(["携帯", p.mobilePhone], ["メール", p.email], ["生年月日", p.birthDate], ["個人のメモ", p.notes]);
    const who = p.isDeceased ? "故人の俗名" : "家族の名前";
    list.push([who, `${p.familyName} ${p.givenName}`], [who, `${p.familyName}${p.givenName}`], ["法号", p.homyo]);
  }
  for (const c of await db.select().from(contacts)) {
    list.push(["一般コンタクトの電話", c.phone], ["一般コンタクトのメール", c.email]);
    list.push(["申請者の名前（伏せる前）", c.name.replace(/[（(].*$/, "").trim()]);
  }
  for (const l of await db.select().from(contactLogs)) list.push(["対応記録の本文", l.body]);
  for (const r of await db.select().from(memorialRequests)) list.push(["申し込みの連絡事項", r.notes]);
  for (const r of await db.select().from(reservations)) list.push(["施設の予約の内容", r.notes], ["施設の予約の件名", r.title]);
  for (const e of await db.select().from(staffEvents).where(isNotNull(staffEvents.memorialServiceId))) {
    list.push(["法要の予定の件名", e.title]);
  }
  // フォームの回答: 文字列の値をすべて集める（選択肢の文字は集計に出るので除く）
  const options = new Set<string>();
  for (const q of await db.select().from(formQuestions)) {
    for (const o of q.options ?? []) options.add(o);
    for (const f of q.itemFields ?? []) for (const o of f.options ?? []) options.add(o);
  }
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      if (!options.has(v)) list.push(["フォームの回答", v]);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const r of await db.select().from(formResponses)) walk(r.answers);
  return list.filter((x): x is [string, string] => typeof x[1] === "string" && x[1].trim().length >= 4);
}

describe("MCP のツールは、返さないと決めた情報を LLM に返さない", () => {
  before(async () => {
    seed = await resetDb();
    runtime = new ToolRuntime(allTools);
    const jushoku = (await getStaffById(seed.get("staff:jushoku")))!;
    ctx = { actor: { ...staffActor(jushoku, "mcp"), staffId: jushoku.id }, now: NOW };
    secrets = await collectSecrets();
    householdNames = (await db.select().from(households)).map((h) => h.name);
    // 確かめる値がシードに十分あること（シードが変わって空振りしないように）
    const kinds = new Set(secrets.map(([what]) => what));
    for (const k of [
      "世帯の電話",
      "携帯",
      "生年月日",
      "対応記録の本文",
      "施設の予約の内容",
      "フォームの回答",
      "故人の俗名",
      "家族の名前",
      "法号",
      "申請者の名前（伏せる前）",
      "施設の予約の件名",
      "法要の予定の件名",
    ]) {
      assert.ok(kinds.has(k), `シードに${k}がない`);
    }
  });
  after(async () => {
    await closeDb();
  });

  it("台帳: search_households、get_household、search_deceased、list_upcoming_memorials", async () => {
    // 検索語が空なら、家の名前は返さず ID だけ。そのあと ID で詳細を取っても、家の名前は返らない
    const found = await call("search_households", { query: "" });
    assertNoSecrets("search_households", found);
    assert.deepEqual(found["世帯"], []);
    const ids = (found["名前を伏せた世帯"] as Obj)["household_id"] as string[];
    assert.ok(ids.length >= 3);
    for (const id of ids) assertNoSecrets("get_household", await call("get_household", { household_id: id }));

    // 電話番号で探せる（結果に番号も家の名前も出ない）
    const phoneArgs = { query: "0422-55-0101" };
    const byPhone = await call("search_households", phoneArgs);
    assert.equal(byPhone["件数"], 1);
    assertNoSecrets("search_households（電話番号で検索）", byPhone, phoneArgs);
    assertNoSecrets("search_households（名字で検索）", await call("search_households", { query: "山田" }));

    assertNoSecrets("search_deceased", await call("search_deceased", { name: "山田" }));
    assertNoSecrets("search_deceased", await call("search_deceased", { relation: "父" }));
    assertNoSecrets("search_deceased（法号で検索）", await call("search_deceased", { homyo: "院" }));
    assertNoSecrets("list_upcoming_memorials", await call("list_upcoming_memorials", { from: "2026-11-01", to: "2027-10-31" }));
  });

  it("法要: verify_memorial（候補が複数 / 確認済み）、list_memorial_requests、book_memorial_service のプレビュー（自宅）", async () => {
    const v = await call("verify_memorial", { name: "山田", relation: "父", kaiki: 7, preferred_from: "2027-03-01", preferred_to: "2027-03-31" });
    assertNoSecrets("verify_memorial（要確認）", v);
    assert.equal(v.status, "要確認");
    const candidates = v["候補"] as Obj[];
    // 同じ名字の 2 つの山田家を、地域（町名）で見分けられる
    const areas = candidates.map((c) => (c["世帯"] as Obj)["地域"]);
    assert.deepEqual([...areas].sort(), ["武蔵野市北町", "武蔵野市本町"]);
    const taro = candidates.find((c) => c["person_id"] === seed.get("person:yamada:father"))!;

    const ok = await call("verify_memorial", {
      person_id: taro["person_id"],
      kaiki: 7,
      preferred_from: "2027-03-01",
      preferred_to: "2027-03-31",
    });
    assertNoSecrets("verify_memorial（確認済み）", ok);

    const requests = await call("list_memorial_requests", { status: "all" });
    assertNoSecrets("list_memorial_requests", requests);
    assert.ok((requests["申し込み"] as Obj[]).length > 0);
    for (const r of requests["申し込み"] as Obj[]) {
      if (r["状態"] !== "受付済み") continue;
      const rid = r["memorial_request_id"];
      assertNoSecrets(
        "find_memorial_slots（申し込みから）",
        await call("find_memorial_slots", { memorial_request_id: rid, travel_before_min: 30, travel_after_min: 30 }),
      );
      assertNoSecrets(
        "decline_memorial_request のプレビュー",
        await call("decline_memorial_request", { memorial_request_id: rid, reason: "その時期はお伺いできません" }),
      );
    }

    const home = { location: "home", travel_before_min: 30, travel_after_min: 30 };
    const slots = await call("find_memorial_slots", { from: "2027-03-01", to: "2027-03-31", person_ids: [taro["person_id"]], ...home });
    assertNoSecrets("find_memorial_slots", slots);
    const day = (slots["候補"] as Obj[])[0];
    const slot = (day["時刻"] as Obj[])[0];
    const preview = await call("book_memorial_service", {
      household_id: (taro["世帯"] as Obj)["household_id"],
      targets: [{ person_id: taro["person_id"], kaiki: 7 }],
      date: (day["日付"] as string).slice(0, 10),
      time: slot["開始"],
      officiant: (slot["担当できる人"] as string[])[0].split(" ")[0],
      ...home,
    });
    assert.equal(preview.status, "needs_confirmation");
    assertNoSecrets("book_memorial_service のプレビュー", preview);
    assert.match(preview.preview as string, /武蔵野市本町/);
  });

  it("カレンダー: 自宅・墓前の法要の予定の内容に入る住所を返さない", async () => {
    const cal = await call("get_staff_calendar", { from: "2026-11-01", to: "2026-12-31" });
    assertNoSecrets("get_staff_calendar", cal);
    const memorials = (cal.events as Obj[]).filter((e) => e["法要"] === true);
    assert.ok(memorials.length > 0);
    assert.ok(memorials.every((e) => e["内容"] === undefined && /\/admin\/memorial\/services\//.test(e["管理画面"] as string)));

    assertNoSecrets("check_staff_availability", await call("check_staff_availability", { from: "2026-12-01", to: "2026-12-31" }));
    // 自宅の法要（2026-12-19 10:00、副住職）と重なる予定のプレビュー。重なりの警告に法要の予定の内容を出さない
    const p = await call("create_staff_event", {
      title: "打ち合わせ",
      category: "来客",
      start: "2026-12-19 10:00",
      end: "2026-12-19 11:00",
      assignees: ["副住職"],
    });
    assert.equal(p.status, "needs_confirmation");
    assert.match(p.preview as string, /別の予定があります/);
    assertNoSecrets("create_staff_event のプレビュー", p);
  });

  it("フォーム: get_form_results（集計だけを返し、回答の値を返さない）", async () => {
    const list = await call("get_form_results", {});
    assertNoSecrets("get_form_results（一覧）", list);
    const r = await call("get_form_results", { title: "花まつり" });
    assertNoSecrets("get_form_results", r);
    assert.ok(r.responses);
  });

  it("施設: check_facility_availability、list_reservations、承認とお断りのプレビュー", async () => {
    assertNoSecrets("check_facility_availability", await call("check_facility_availability", { from: "2026-11-01", to: "2026-12-31" }));
    const all = await call("list_reservations", { status: "all", from: "2026-01-01" });
    assertNoSecrets("list_reservations", all);
    const pending = (all["予約"] as Obj[]).filter((r) => r["状態"] === "申請中");
    assert.ok(pending.length > 0);
    for (const r of pending) {
      assertNoSecrets("approve_reservation のプレビュー", data(await runtime.call("approve_reservation", { request_code: r["申請番号"] }, ctx)));
      assertNoSecrets(
        "reject_reservation のプレビュー",
        await call("reject_reservation", { request_code: r["申請番号"], reason: "あいにくその日は行事があります" }),
      );
    }
  });

  it("add_contact_log のプレビューは、世帯を町名で示す（家の名前は引数に入っているときだけ）", async () => {
    const p = await call("add_contact_log", { household_id: seed.get("household:tanaka"), kind: "案内", body: "法要のご案内をした" });
    assertNoSecrets("add_contact_log のプレビュー", p);
    assert.match(p.preview as string, /武蔵野市栄町の世帯に対応記録を追加します/);
    const named = await call("add_contact_log", { household_id: seed.get("household:tanaka"), kind: "案内", body: "田中さんに法要のご案内をした" });
    assert.match(named.preview as string, /武蔵野市栄町の田中家に対応記録を追加します/);
  });

  it("法要の重複の登録のエラーにも、故人の名前を入れない", async () => {
    const r = await runtime.call(
      "book_memorial_service",
      {
        household_id: seed.get("household:sato"),
        targets: [{ person_id: seed.get("person:sato:father"), kaiki: 7 }],
        date: "2026-12-12",
        time: "10:00",
        officiant: "住職",
      },
      ctx,
    );
    assert.equal(r.ok, false);
    const msg = (r as { error: string }).error;
    assertNoSecrets("book_memorial_service のエラー", msg);
    assert.match(msg, /父（2020 年没）の七回忌は、すでに/);
  });
});
