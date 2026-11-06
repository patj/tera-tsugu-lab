// 台本の場面 3 を MCP のツールで通す: create_form → confirm_action → 個別リンクと共通リンクからの回答 → get_form_results
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { auditLogs, forms } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { getStaffById, staffActor } from "@/domain/core";
import {
  countLinkHouseholds,
  findHouseholdToken,
  getFormForRespondent,
  publicRespondentActor,
  resolveHouseholdToken,
  rosterCsv,
  submitResponse,
} from "@/domain/forms";
import type { ToolContext } from "@/mcp/framework/define";
import { ToolRuntime, type ToolResult } from "@/mcp/framework/runtime";
import { allTools } from "@/mcp/tools";
import { resetDb } from "../helpers/db";
import { createTanaka, createYamada, type TestHousehold } from "./helpers";

const NOW = new Date("2026-11-07T01:00:00Z");

/** 「ほうろく灸の申し込みフォームを作って。祈願する人ごとに、カナ、氏名、生年月日、男女、祈願の主旨を聞いて。檀家さんにも一般の方にも」 */
const HOROKU_ARGS = {
  title: "ほうろく灸 申し込み",
  description: "夏の土用の丑の日に、ほうろく灸の祈祷を行います。祈願する方ごとにご記入ください。",
  mode: "both",
  questions: [
    { type: "short", label: "申込者のお名前", required: true, profile_field: "name" },
    { type: "short", label: "電話番号", required: true, profile_field: "phone" },
    {
      type: "person_list",
      label: "祈願する方",
      required: true,
      max_persons: 5,
      item_fields: [
        { label: "カナ", type: "short", required: true, profile_field: "kana" },
        { label: "氏名", type: "short", required: true, profile_field: "name" },
        { label: "生年月日", type: "date", required: true, profile_field: "birth_date" },
        { label: "男女", type: "single", required: true, options: ["男", "女"], profile_field: "gender" },
        { label: "祈願の主旨", type: "long", required: true },
      ],
    },
  ],
};

let seed: SeedContext;
let ctx: ToolContext;
let runtime: ToolRuntime;
let yamada: TestHousehold;

function data(r: ToolResult): Record<string, unknown> {
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  return (r as { data: Record<string, unknown> }).data;
}

describe("MCP: 行事・アンケートフォーム（場面 3）", () => {
  beforeEach(async () => {
    seed = await resetDb();
    const s = await getStaffById(seed.get("staff:jushoku"));
    ctx = { actor: { ...staffActor(s!, "mcp"), staffId: s!.id }, now: NOW };
    runtime = new ToolRuntime(allTools);
    yamada = await createYamada(seed.templeId);
    await createTanaka(seed.templeId);
  });
  after(async () => {
    await closeDb();
  });

  it("create_form → confirm_action → 個別リンクと共通リンクから回答 → get_form_results で人数がわかる", async () => {
    // 1. プレビュー（まだ作らない）
    const before = (await db.select().from(forms)).length;
    const preview = data(await runtime.call("create_form", HOROKU_ARGS, ctx));
    assert.equal(preview.status, "needs_confirmation");
    const summary = preview.preview as string;
    assert.match(summary, /フォーム「ほうろく灸 申し込み」を作り、受付中にします/);
    assert.match(summary, /3\. 祈願する方（人ごとの項目、最大 5 人、必須）/);
    assert.match(summary, /- 男女（単一選択、必須、選択肢: 男 \/ 女、台帳から自動入力: 性別）/);
    assert.match(summary, /- 祈願の主旨（長い記述、必須）/);
    // 台帳のシードの世帯も入るので、件数はその時点の檀家の世帯の数と比べる
    const households = await countLinkHouseholds(ctx.actor);
    assert.ok(households >= 2);
    assert.match(summary, new RegExp(`檀家 ${households} 世帯に発行します`));
    assert.doesNotMatch(summary, /注意:/);
    assert.equal((await db.select().from(forms)).length, before);

    // 2. 了承 → 実行
    const done = data(await runtime.call("confirm_action", { confirmation_id: preview.confirmation_id }, ctx));
    const result = done.result as Record<string, unknown>;
    const formId = result.form_id as string;
    assert.equal(result.status, "受付中");
    assert.equal(result.household_links, households);
    assert.equal(result.public_url, `http://localhost:3000/f/${formId}`);
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "forms.create"), eq(auditLogs.target, `form:${formId}`)));
    assert.equal(audit.channel, "mcp");

    // 3. 山田さんが個別リンクから、家族を選んで祈願の主旨だけを入力する
    const token = await findHouseholdToken(formId, yamada.id);
    const householdId = await resolveHouseholdToken(formId, token!);
    const view = await getFormForRespondent(formId, { source: "member_link", householdId });
    assert.deepEqual(view?.questions.map((q) => q.label), ["祈願する方"]);
    const list = view!.questions[0];
    const reason = list.itemFields!.find((f) => !f.autoFill)!;
    assert.equal(reason.label, "祈願の主旨");
    const pick = (name: string, text: string) => {
      const c = list.candidates.find((x) => x.name === name)!;
      return { personId: c.personId, values: { ...c.values, [reason.key]: text } };
    };
    const pub = publicRespondentActor(seed.templeId);
    await submitResponse(pub, formId, {
      source: "member_link",
      householdId,
      answers: { [list.id]: [pick("山田 太郎", "家内安全"), pick("山田 花子", "病気平癒")] },
    });

    // 4. 一般の人が共通リンクから、すべての項目を入力する
    const pv = await getFormForRespondent(formId, { source: "public" });
    const [nameQ, phoneQ, listQ] = pv!.questions;
    await submitResponse(pub, formId, {
      source: "public",
      answers: {
        [nameQ.id]: "鈴木 一郎",
        [phoneQ.id]: "090-1234-5678",
        [listQ.id]: [
          { values: { kana: "スズキ イチロウ", name: "鈴木 一郎", birth_date: "1970-01-01", gender: "男", f5: "身体健全" } },
          { values: { kana: "スズキ サチ", name: "鈴木 幸", birth_date: "1972-05-05", gender: "女", f5: "諸願成就" } },
          { values: { kana: "スズキ ミチ", name: "鈴木 道", birth_date: "2005-12-24", gender: "女", f5: "学業成就" } },
        ],
      },
    });

    // 5. 「ほうろく灸の申し込みは今何人？」
    const r = data(await runtime.call("get_form_results", { title: "ほうろく灸" }, ctx));
    assert.equal(r.form_id, formId);
    assert.deepEqual(r.responses, { 檀家: 1, 一般: 1, 合計: 2 });
    assert.deepEqual(r.persons, { 檀家: 2, 一般: 3, 合計: 5 });
    assert.equal(r.summary, "回答 2 件（檀家 1 件、一般 1 件）。祈願する方は 5 人（檀家 2 人、一般 3 人）");

    // 6. 管理画面で名簿の CSV を出す（1 人 1 行）
    const csv = await rosterCsv(ctx.actor, formId);
    assert.equal((csv.body.match(/\r\n\d+,/g) ?? []).length, 5);
    assert.ok(csv.body.includes(",ヤマダ ハナコ,山田 花子,1968-09-15,女,病気平癒"));
  });

  it("get_form_results: 題名が見つからない、または引数がないときは候補を返す", async () => {
    const { confirmation_id } = data(await runtime.call("create_form", HOROKU_ARGS, ctx));
    data(await runtime.call("confirm_action", { confirmation_id }, ctx));
    const none = data(await runtime.call("get_form_results", { title: "除夜の鐘" }, ctx));
    assert.match(none.message as string, /見つかりません/);
    const open = data(await runtime.call("get_form_results", {}, ctx));
    assert.deepEqual((open.forms as { title: string }[]).map((f) => f.title), ["ほうろく灸 申し込み"]);
    const bad = await runtime.call("get_form_results", { form_id: "nope" }, ctx);
    assert.equal(bad.ok, false);
  });

  it("create_form: 構造の誤りはプレビューの時点で伝え、連絡先の設問がなければ注意を出す", async () => {
    const bad = await runtime.call(
      "create_form",
      { ...HOROKU_ARGS, questions: [{ type: "person_list", label: "祈願する方" }] },
      ctx,
    );
    assert.equal(bad.ok, false);
    assert.match((bad as { error: string }).error, /1 人分の項目を 1 つ以上/);

    const warn = data(await runtime.call("create_form", { ...HOROKU_ARGS, questions: [HOROKU_ARGS.questions[2]] }, ctx));
    assert.match(warn.preview as string, /注意: 一般の方の代表者の氏名と連絡先/);
  });
});
