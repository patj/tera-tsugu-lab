// 試す画面のサーバー（Vite の開発サーバー）で、AI の仕事を実行する（/__kit/ai/<app-id>/<仕事>）。
// 本体と同じ処理（sdk/ai-server.ts）で Claude を呼ぶ。キーは .env の ANTHROPIC_API_KEY（サーバーだけが読み、ブラウザには渡さない）。
// 送った内容と返事はログに出さない。使ったトークン数と、おおよその費用だけを表示する。このファイルは変えなくてよい
import type { IncomingMessage, ServerResponse } from "node:http";
import { createAiClient, estimateCostUsd, runAiTask, type AiCallInput } from "../sdk/ai-server";
import { APP_AI_DEFAULT_MODEL, APP_AI_LIMITS, type AppAITasks, type AppManifest } from "../sdk/types";

const MAX_BODY_BYTES = (APP_AI_LIMITS.maxImages + 1) * APP_AI_LIMITS.maxImageBytes * 2;
const SAFE_ID = /^[a-z0-9_][a-z0-9-_]*$/i;

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

type Loader = (url: string) => Promise<Record<string, unknown>>;

export async function handleAiRequest(req: IncomingMessage, res: ServerResponse, load: Loader, apiKey: string | undefined): Promise<void> {
  const send = (body: unknown) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST") return send({ ok: false, kind: "invalid_input", message: "POST で送ってください" });
  // ほかのサイトから、試す人のキーで AI を呼ばせない（本体の API と同じ決まり）:
  // JSON だけを受け付け（ほかのサイトのフォームや text/plain の送信を断る）、Origin があれば同じホストに限る
  if (!(req.headers["content-type"] ?? "").includes("application/json")) {
    res.statusCode = 415;
    return send({ ok: false, kind: "invalid_input", message: "JSON で送ってください" });
  }
  const origin = req.headers.origin;
  if (origin) {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === req.headers.host;
    } catch {
      sameHost = false;
    }
    if (!sameHost) {
      res.statusCode = 403;
      return send({ ok: false, kind: "unavailable", message: "このページからは送れません" });
    }
  }
  const [appId, task] = (req.url ?? "").replace(/^\//, "").split("?")[0].split("/").map(decodeURIComponent);
  if (!appId || !task || !SAFE_ID.test(appId) || !SAFE_ID.test(task)) return send({ ok: false, kind: "invalid_input", message: "アプリか仕事の名前が正しくありません" });
  let manifest: AppManifest;
  let tasks: AppAITasks | undefined;
  try {
    manifest = (await load(`/apps/${appId}/manifest.ts`)).manifest as AppManifest;
    tasks = (await load(`/apps/${appId}/ai.ts`)).ai as AppAITasks;
  } catch {
    return send({ ok: false, kind: "unavailable", message: `apps/${appId}/ai.ts を読み込めませんでした（npm run apps:check で確かめてください）` });
  }
  const def = tasks?.[task];
  if (!manifest?.ai || !def) return send({ ok: false, kind: "unavailable", message: `AI の仕事「${task}」がありません（manifest の ai と ai.ts を確かめてください）` });
  if (!apiKey) {
    return send({ ok: false, kind: "unavailable", message: "AI のキーがありません。キットの .env に ANTHROPIC_API_KEY を入れて、npm run dev をやり直してください" });
  }
  let input: AiCallInput;
  try {
    input = (await readJson(req)) as AiCallInput;
  } catch {
    return send({ ok: false, kind: "invalid_input", message: "送る内容が大きすぎるか、形が正しくありません" });
  }
  const outcome = await runAiTask({ client: createAiClient(apiKey), manifest, task: def, input, log: (l) => console.warn(`[AI] ${l}`) });
  if (outcome.usage) {
    const model = manifest.ai.model ?? APP_AI_DEFAULT_MODEL;
    const u = outcome.usage;
    console.log(
      `[AI] ${appId}/${task}: ${outcome.ok ? "成功" : outcome.kind}（${model}、入力 ${u.inputTokens} / 出力 ${u.outputTokens} トークン、約 $${estimateCostUsd(model, u).toFixed(4)}）`,
    );
  }
  send(outcome.ok ? { ok: true, data: outcome.data } : { ok: false, kind: outcome.kind, message: outcome.message });
}
