// 本体の AI の中継: 同意（版つき）、上限（1 日の回数、月の費用、全体の 1 分あたり）、使用の記録、操作者の制限（spec.md §7「AI」）
// Claude のクライアントは差し替える（本物の API は呼ばない）
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq, like } from "drizzle-orm";
import { z } from "zod";
import { closeDb, db } from "@/db/client";
import { appAiConsents, appAiUsage, auditLogs } from "@/db/schema";
import type { AiClient } from "@/apps-sdk/ai-server";
import { appAIConsentVersion, defineAppAI, defineAppManifest, type AppDefinition } from "@/apps-sdk/types";
import { getStaffById, staffActor, type Actor } from "@/domain/core";
import {
  appAiConfigFromEnv,
  getAppAiConsent,
  getAppAiUsageSummary,
  runAppAi,
  setAppAiConsent,
  setAppsForTesting,
  startAppUser,
  toAppUserActor,
  type AppAiConfig,
} from "@/domain/apps";
import { resetDb } from "../helpers/db";
import { rejects } from "../portal/helpers";

const APP = "test-closet";
const manifest = defineAppManifest({
  id: APP,
  name: "テストのクローゼット",
  description: "テスト用",
  icon: "👗",
  sharing: false,
  ai: { purpose: "日記から服を選ぶため", sends: ["日記の文字"], model: "claude-sonnet-5-5", dailyLimit: 3 },
});
const ai = defineAppAI({
  tailor: { instructions: "あなたは仕立て屋です。", output: z.object({ shape: z.enum(["coat", "cape"]), name: z.string().max(20) }) },
});
const DEFS: AppDefinition[] = [{ manifest, ai }];
const VERSION = appAIConsentVersion(manifest);

const config = (over: Partial<AppAiConfig> = {}): AppAiConfig => ({ apiKey: "test-key", monthlyBudgetUsd: () => 10, globalPerMinute: 100, ...over });

function fakeClient(reply: () => unknown = () => okMessage) {
  let calls = 0;
  const create = async () => {
    calls++;
    const r = reply();
    if (r instanceof Error) throw r;
    return r;
  };
  return { client: { messages: { create }, beta: { messages: { create } } } as unknown as AiClient, calls: () => calls };
}
const okMessage = {
  model: "claude-sonnet-5-5",
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify({ shape: "coat", name: "雨宿りのコート" }) }],
  usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
};

let staff: Actor;
let hana: Actor;
let taro: Actor;

before(() => setAppsForTesting(DEFS));
after(async () => {
  setAppsForTesting(null);
  await closeDb();
});
beforeEach(async () => {
  const seed = await resetDb();
  const s = await getStaffById(seed.get("staff:jushoku"));
  assert.ok(s);
  staff = staffActor(s, "web");
  hana = toAppUserActor(await startAppUser(seed.templeId, "はな"));
  taro = toAppUserActor(await startAppUser(seed.templeId, "たろう"));
});

const SECRET = "とても秘密の日記";
const run = (actor: Actor, f: ReturnType<typeof fakeClient>, cfg = config(), text = SECRET) =>
  runAppAi(actor, APP, "tailor", { text }, { client: f.client, config: cfg });

describe("同意", () => {
  it("同意していなければ Claude を呼ばず needs_consent を返す", async () => {
    const f = fakeClient();
    const r = await run(hana, f);
    assert.equal(!r.ok && r.kind, "needs_consent");
    assert.equal(f.calls(), 0);
  });

  it("見せた説明の版が今と違えば同意を受け付けない。同意とやめるは履歴と監査ログに残る", async () => {
    await rejects(setAppAiConsent(hana, APP, "old-version", true), "invalid", /説明が変わりました/);
    assert.deepEqual(await setAppAiConsent(hana, APP, VERSION, true), { consented: true });
    assert.equal(await getAppAiConsent(hana, APP), true);
    assert.equal(await getAppAiConsent(taro, APP), false);
    await setAppAiConsent(hana, APP, VERSION, false);
    assert.equal(await getAppAiConsent(hana, APP), false);
    assert.equal((await db.select().from(appAiConsents).where(eq(appAiConsents.appId, APP))).length, 2);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "apps.ai_consent.set"));
    assert.equal(logs.length, 2);
    assert.match(logs[0].actor, /^apps:利用者 /);
  });

  it("説明（sends や purpose）が変わると、同意し直すまで使えない", async () => {
    await setAppAiConsent(hana, APP, VERSION, true);
    setAppsForTesting([{ manifest: { ...manifest, ai: { ...manifest.ai, sends: ["日記の文字", "写真"] } }, ai }]);
    try {
      assert.equal(await getAppAiConsent(hana, APP), false);
      const f = fakeClient();
      assert.equal((await run(hana, f)).ok, false);
      assert.equal(f.calls(), 0);
    } finally {
      setAppsForTesting(DEFS);
    }
  });
});

describe("呼び出しと記録", () => {
  it("同意していれば呼び、使用を記録する（内容は残さない）", async () => {
    await setAppAiConsent(hana, APP, VERSION, true);
    const f = fakeClient();
    const r = await run(hana, f);
    assert.deepEqual(r, { ok: true, data: { shape: "coat", name: "雨宿りのコート" } });
    const [u] = await db.select().from(appAiUsage).where(eq(appAiUsage.appId, APP));
    assert.deepEqual({ result: u.result, model: u.model, task: u.task, in: u.inputTokens, out: u.outputTokens }, { result: "ok", model: "claude-sonnet-5-5", task: "tailor", in: 1000, out: 100 });
    assert.equal(u.costMicroUsd, 3000); // 1000 × $2/M + 100 × $10/M = $0.003
    for (const row of [...(await db.select().from(appAiUsage)), ...(await db.select().from(auditLogs).where(like(auditLogs.action, "apps.%")))]) {
      assert.ok(!JSON.stringify(row).includes("秘密"), "送った内容を残さない");
    }
  });

  it("断られたときも、結果の種類とトークン数を記録する", async () => {
    await setAppAiConsent(hana, APP, VERSION, true);
    const f = fakeClient(() => ({ ...okMessage, stop_reason: "refusal", content: [] }));
    assert.equal((await run(hana, f)).ok, false);
    const [u] = await db.select().from(appAiUsage).where(eq(appAiUsage.appId, APP));
    assert.equal(u.result, "refusal");
    assert.equal(u.inputTokens, 1000);
  });

  it("入力が正しくなければ、回数に数えず Claude も呼ばない", async () => {
    await setAppAiConsent(hana, APP, VERSION, true);
    const f = fakeClient();
    const r = await run(hana, f, config(), "x".repeat(5000));
    assert.equal(!r.ok && r.kind, "invalid_input");
    assert.equal(f.calls(), 0);
    assert.equal((await db.select().from(appAiUsage)).length, 0);
  });

  it("キーがなければ unavailable", async () => {
    await setAppAiConsent(hana, APP, VERSION, true);
    const r = await runAppAi(hana, APP, "tailor", { text: "x" }, { config: config({ apiKey: undefined }) });
    assert.equal(!r.ok && r.kind, "unavailable");
  });

  it("ない仕事は not_found", async () => {
    await setAppAiConsent(hana, APP, VERSION, true);
    await rejects(runAppAi(hana, APP, "nope", { text: "x" }, { client: fakeClient().client, config: config() }), "not_found");
  });
});

describe("上限", () => {
  it("利用者ごとの 1 日の回数（manifest の dailyLimit）", async () => {
    await setAppAiConsent(hana, APP, VERSION, true);
    await setAppAiConsent(taro, APP, VERSION, true);
    const f = fakeClient();
    for (let i = 0; i < 3; i++) assert.equal((await run(hana, f)).ok, true);
    const r = await run(hana, f);
    assert.equal(!r.ok && r.kind, "limit");
    assert.match(!r.ok ? r.message : "", /1 日 3 回/);
    assert.equal(f.calls(), 3);
    assert.equal((await run(taro, f)).ok, true, "ほかの利用者は使える");
  });

  it("アプリごとの月の費用（だれでも新しい利用者になれても止まる）", async () => {
    await setAppAiConsent(hana, APP, VERSION, true);
    await setAppAiConsent(taro, APP, VERSION, true);
    const f = fakeClient();
    const cfg = config({ monthlyBudgetUsd: () => 0.002 }); // 1 回 $0.003
    assert.equal((await run(hana, f, cfg)).ok, true);
    const r = await run(taro, f, cfg);
    assert.equal(!r.ok && r.kind, "limit");
    assert.match(!r.ok ? r.message : "", /今月/);
  });

  it("基盤全体の 1 分あたりの回数", async () => {
    await setAppAiConsent(hana, APP, VERSION, true);
    await setAppAiConsent(taro, APP, VERSION, true);
    const f = fakeClient();
    const cfg = config({ globalPerMinute: 1 });
    assert.equal((await run(hana, f, cfg)).ok, true);
    const r = await run(taro, f, cfg);
    assert.equal(!r.ok && r.kind, "limit");
    assert.match(!r.ok ? r.message : "", /混み合って/);
  });

  it("同時に呼んでも、1 日の回数を超えない", async () => {
    await setAppAiConsent(hana, APP, VERSION, true);
    const f = fakeClient();
    const results = await Promise.all(Array.from({ length: 6 }, () => run(hana, f)));
    assert.equal(results.filter((r) => r.ok).length, 3);
    assert.equal(f.calls(), 3);
  });
});

describe("設定と、スタッフ向けの集計、操作者の制限", () => {
  it("環境変数から設定を読む（アプリごとの上限は JSON）", () => {
    const c = appAiConfigFromEnv({ ANTHROPIC_API_KEY: "k", APPS_AI_MONTHLY_BUDGET_USD: "5", APPS_AI_BUDGETS_USD: '{"a": 30}', APPS_AI_GLOBAL_PER_MINUTE: "10" } as unknown as NodeJS.ProcessEnv);
    assert.deepEqual([c.apiKey, c.monthlyBudgetUsd("a"), c.monthlyBudgetUsd("b"), c.globalPerMinute], ["k", 30, 5, 10]);
    const d = appAiConfigFromEnv({ APPS_AI_BUDGETS_USD: "{broken" } as unknown as NodeJS.ProcessEnv);
    assert.deepEqual([d.apiKey, d.monthlyBudgetUsd("a"), d.globalPerMinute], [undefined, 10, 60]);
  });

  it("スタッフは今月の回数と費用を見られる（中身は見えない）", async () => {
    await setAppAiConsent(hana, APP, VERSION, true);
    await run(hana, fakeClient());
    await run(hana, fakeClient(() => ({ ...okMessage, stop_reason: "refusal", content: [] })));
    const [s] = await getAppAiUsageSummary(staff, { config: config() });
    assert.deepEqual({ app: s.appId, calls: s.calls, failures: s.failures, budget: s.budgetUsd }, { app: APP, calls: 2, failures: 1, budget: 10 });
    assert.ok(Math.abs(s.costUsd - 0.006) < 1e-9);
  });

  it("MCP の操作者とスタッフは、利用者の関数を使えない。利用者はスタッフの集計を見られない", async () => {
    const mcp = { ...hana, channel: "mcp" as const };
    await rejects(runAppAi(mcp, APP, "tailor", { text: "x" }), "forbidden", /MCP/);
    await rejects(setAppAiConsent(mcp, APP, VERSION, true), "forbidden", /MCP/);
    await rejects(runAppAi(staff, APP, "tailor", { text: "x" }), "forbidden");
    await rejects(getAppAiUsageSummary(hana), "forbidden");
    await rejects(getAppAiUsageSummary({ ...staff, channel: "mcp" }), "forbidden", /MCP/);
  });
});
