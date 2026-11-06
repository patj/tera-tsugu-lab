// お寺のアプリの AI の中継（本体）。spec.md §7「AI」
// - 同意: 版つきの履歴（app_ai_consents）。今の説明の版と同じ版に同意しているときだけ使える。変更は監査ログに残す
// - 上限: 利用者ごとの 1 日の回数（manifest の ai.dailyLimit）、アプリごとの月の費用、基盤全体の 1 分あたりの回数
//   匿名で、だれでも新しい利用者になれるので、利用者ごとの上限だけでは足りない（アプリごとと全体の上限を必ず置く）
// - 記録: 使った日時、アプリ、利用者、仕事、モデル、結果の種類、トークン数、費用だけ（送った内容と返事は残さず、ログにも出さない）
// - キーと費用は運用者が持つ（環境変数 ANTHROPIC_API_KEY。サーバーだけが読む）
import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import { db } from "@/db/client";
import { appAiConsents, appAiUsage } from "@/db/schema";
import { createAiClient, estimateCostUsd, prepareInput, runAiTask, type AiCallInput, type AiClient } from "@/apps-sdk/ai-server";
import { APP_AI_DEFAULT_MODEL, APP_AI_LIMITS, appAIConsentVersion, type AppAIResult, type AppManifest } from "@/apps-sdk/types";
import type { Actor } from "../core/actor";
import { writeAuditLog } from "../core/audit";
import { invalid, notFound } from "../core/errors";
import { jst, todayJst } from "../core/time";
import { assertAppStaff, assertAppUser } from "./guard";
import { findAppAiTask, getApp, listApps } from "./registry";
import { appTarget } from "./sharing";

/** 運用者の設定（環境変数） */
export type AppAiConfig = {
  apiKey: string | undefined;
  /** アプリごとの月の費用の上限（米ドル） */
  monthlyBudgetUsd: (appId: string) => number;
  /** 基盤全体の 1 分あたりの回数の上限 */
  globalPerMinute: number;
};

export const DEFAULT_MONTHLY_BUDGET_USD = 10;
export const DEFAULT_GLOBAL_PER_MINUTE = 60;

/**
 * 環境変数から読む
 * - ANTHROPIC_API_KEY: Claude の API キー
 * - APPS_AI_MONTHLY_BUDGET_USD: アプリごとの月の費用の上限（初期値 10 ドル）
 * - APPS_AI_BUDGETS_USD: アプリごとに変えるとき（JSON。例: {"heart-closet": 30}）
 * - APPS_AI_GLOBAL_PER_MINUTE: 基盤全体の 1 分あたりの回数（初期値 60）
 */
export function appAiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AppAiConfig {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : d;
  };
  let perApp: Record<string, unknown> = {};
  try {
    perApp = env.APPS_AI_BUDGETS_USD ? (JSON.parse(env.APPS_AI_BUDGETS_USD) as Record<string, unknown>) : {};
  } catch {
    perApp = {};
  }
  const base = num(env.APPS_AI_MONTHLY_BUDGET_USD, DEFAULT_MONTHLY_BUDGET_USD);
  return {
    apiKey: env.ANTHROPIC_API_KEY || undefined,
    monthlyBudgetUsd: (appId) => (typeof perApp[appId] === "number" && (perApp[appId] as number) >= 0 ? (perApp[appId] as number) : base),
    globalPerMinute: num(env.APPS_AI_GLOBAL_PER_MINUTE, DEFAULT_GLOBAL_PER_MINUTE),
  };
}

function aiApp(appId: string): AppManifest {
  const m = getApp(appId);
  if (!m.ai) throw invalid("このアプリは AI を使う設定になっていません");
  return m;
}

/** 利用者本人: 今の説明に同意しているか */
export async function getAppAiConsent(actor: Actor, appId: string): Promise<boolean> {
  assertAppUser(actor);
  const m = aiApp(appId);
  const [last] = await db
    .select({ version: appAiConsents.version, agreed: appAiConsents.agreed })
    .from(appAiConsents)
    .where(and(eq(appAiConsents.templeId, actor.templeId), eq(appAiConsents.userId, actor.appUserId), eq(appAiConsents.appId, appId)))
    .orderBy(desc(appAiConsents.changedAt))
    .limit(1);
  return Boolean(last?.agreed && last.version === appAIConsentVersion(m));
}

/**
 * 利用者本人: 同意する・やめる。version は、利用者に見せた説明の版（今の説明と違えば、同意は受け付けない）。
 * 履歴に追記し、監査ログに残す。今と同じなら何もしない
 */
export async function setAppAiConsent(actor: Actor, appId: string, version: string, agreed: boolean): Promise<{ consented: boolean }> {
  assertAppUser(actor);
  const m = aiApp(appId);
  const current = appAIConsentVersion(m);
  if (agreed && version !== current) throw invalid("AI に送る内容の説明が変わりました。画面を読み直して、もう一度ご確認ください");
  if ((await getAppAiConsent(actor, appId)) === agreed) return { consented: agreed };
  await db.transaction(async (tx) => {
    await tx.insert(appAiConsents).values({ templeId: actor.templeId, userId: actor.appUserId, appId, version: current, agreed });
    await writeAuditLog(
      actor,
      { action: "apps.ai_consent.set", target: appTarget(actor.appUserId, appId), summary: agreed ? `AI に送ることに同意する（版 ${current}）` : "AI に送ることへの同意をやめる", result: "ok" },
      tx,
    );
  });
  return { consented: agreed };
}

const limit = (message: string): AppAIResult<never> => ({ ok: false, kind: "limit", message });

/**
 * 利用者本人: AI の仕事を実行する。同意、上限を確かめ、使用を記録する。
 * opts.client はテストで差し替える（なければ運用者のキーで作る）
 */
export async function runAppAi(
  actor: Actor,
  appId: string,
  taskName: string,
  input: AiCallInput,
  opts: { client?: AiClient; config?: AppAiConfig; now?: Date } = {},
): Promise<AppAIResult<unknown>> {
  assertAppUser(actor);
  const found = findAppAiTask(appId, taskName);
  if (!found) throw notFound("AI の仕事が見つかりません");
  const { manifest, task } = found;
  const config = opts.config ?? appAiConfigFromEnv();
  const now = opts.now ?? new Date();
  const model = manifest.ai?.model ?? APP_AI_DEFAULT_MODEL;

  if (!(await getAppAiConsent(actor, appId))) return { ok: false, kind: "needs_consent", message: "AI に送ることに同意していないため、使えません" };
  if (!config.apiKey && !opts.client) return { ok: false, kind: "unavailable", message: "AI の準備ができていません（運用者の設定待ち）" };
  // 入力が正しくないものは、回数に数えない（Claude も呼ばない）
  const prepared = prepareInput(task, input);
  if (!prepared.ok) {
    const o = prepared.outcome;
    return o.ok ? { ok: false, kind: "invalid_input", message: "入力を確かめてください" } : { ok: false, kind: o.kind, message: o.message };
  }

  // 上限を確かめ、呼ぶ前に pending の行を入れる（同時の呼び出しも数えるため、確かめと記録を 1 つのトランザクションで行う）
  const dayStart = jst(todayJst(now));
  const monthStart = jst(`${todayJst(now).slice(0, 7)}-01`);
  const minuteAgo = new Date(now.getTime() - 60_000);
  const dailyLimit = Math.min(manifest.ai?.dailyLimit ?? APP_AI_LIMITS.defaultDailyLimit, APP_AI_LIMITS.maxDailyLimit);
  const budgetMicroUsd = Math.round(config.monthlyBudgetUsd(appId) * 1_000_000);
  const reserved = await db.transaction(async (tx) => {
    // 同じお寺の AI の呼び出しを 1 つずつ確かめる（数えてから入れるまでの間に、ほかの呼び出しが割り込まないように）
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`app_ai_usage:${actor.templeId}`}))`);
    const [{ n: perMinute }] = await tx
      .select({ n: count() })
      .from(appAiUsage)
      .where(and(eq(appAiUsage.templeId, actor.templeId), gte(appAiUsage.createdAt, minuteAgo)));
    if (perMinute >= config.globalPerMinute) return limit("AI が混み合っています。少し時間をおいてお試しください");
    const [{ spent }] = await tx
      .select({ spent: sum(appAiUsage.costMicroUsd) })
      .from(appAiUsage)
      .where(and(eq(appAiUsage.templeId, actor.templeId), eq(appAiUsage.appId, appId), gte(appAiUsage.createdAt, monthStart)));
    if (Number(spent ?? 0) >= budgetMicroUsd) return limit("今月は、このアプリで AI を使える上限に達しました。来月またお試しください");
    const [{ n: today }] = await tx
      .select({ n: count() })
      .from(appAiUsage)
      .where(and(eq(appAiUsage.userId, actor.appUserId), eq(appAiUsage.appId, appId), gte(appAiUsage.createdAt, dayStart)));
    if (today >= dailyLimit) return limit(`AI を使えるのは 1 日 ${dailyLimit} 回までです。明日またお試しください`);
    const [row] = await tx
      .insert(appAiUsage)
      .values({ templeId: actor.templeId, userId: actor.appUserId, appId, task: taskName, model, result: "pending" })
      .returning({ id: appAiUsage.id });
    return row.id;
  });
  if (typeof reserved !== "string") return reserved;

  const outcome = await runAiTask({
    client: opts.client ?? createAiClient(config.apiKey!),
    manifest,
    task,
    input,
    // 本文はログに出さない（ai-server が種類と状態コードだけを渡す）
    log: (line) => console.error(`apps: ${appId}/${taskName}: ${line}`),
  });
  const u = outcome.usage;
  await db
    .update(appAiUsage)
    .set({
      result: outcome.ok ? "ok" : outcome.kind,
      inputTokens: u?.inputTokens ?? 0,
      outputTokens: u?.outputTokens ?? 0,
      cacheReadTokens: u?.cacheReadTokens ?? 0,
      cacheWriteTokens: u?.cacheWriteTokens ?? 0,
      costMicroUsd: u ? Math.ceil(estimateCostUsd(model, u) * 1_000_000) : 0,
    })
    .where(eq(appAiUsage.id, reserved));
  return outcome.ok ? { ok: true, data: outcome.data } : { ok: false, kind: outcome.kind, message: outcome.message };
}

export type AppAiUsageSummary = {
  appId: string;
  appName: string;
  model: string;
  calls: number;
  failures: number;
  costUsd: number;
  budgetUsd: number;
};

/** スタッフ向け: 今月の AI の使用（アプリごと。中身は返さない） */
export async function getAppAiUsageSummary(actor: Actor, opts: { config?: AppAiConfig; now?: Date } = {}): Promise<AppAiUsageSummary[]> {
  assertAppStaff(actor);
  const config = opts.config ?? appAiConfigFromEnv();
  const monthStart = jst(`${todayJst(opts.now ?? new Date()).slice(0, 7)}-01`);
  const rows = await db
    .select({
      appId: appAiUsage.appId,
      calls: count(),
      failures: sql<number>`count(*) filter (where ${appAiUsage.result} not in ('ok', 'pending'))`,
      cost: sum(appAiUsage.costMicroUsd),
    })
    .from(appAiUsage)
    .where(and(eq(appAiUsage.templeId, actor.templeId), gte(appAiUsage.createdAt, monthStart)))
    .groupBy(appAiUsage.appId);
  const byApp = new Map(rows.map((r) => [r.appId, r]));
  return listApps()
    .filter((m) => m.ai)
    .map((m) => {
      const r = byApp.get(m.id);
      return {
        appId: m.id,
        appName: m.name,
        model: m.ai?.model ?? APP_AI_DEFAULT_MODEL,
        calls: r?.calls ?? 0,
        failures: Number(r?.failures ?? 0),
        costUsd: Number(r?.cost ?? 0) / 1_000_000,
        budgetUsd: config.monthlyBudgetUsd(m.id),
      };
    });
}
