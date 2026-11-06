// AI の仕事を実行する（サーバーだけで使う。ブラウザやアプリのコードから import しない）。spec.md §7「AI」
// リクエストは基盤が組み立てる: system はアプリの宣言した指示、user は利用者の文字と画像だけ。ツールやほかのメッセージは渡さない。
// 送った内容と返事は、保存もログもしない（エラーのときも、種類と状態コードだけ）。
// このファイルは、本体（AI の中継）と開発キット（試す画面のサーバー）で共通（npm run kit:build でコピーする）
import Anthropic from "@anthropic-ai/sdk";
import { taskOutputJsonSchema } from "./ai-schema";
import { APP_AI_DEFAULT_MODEL, APP_AI_LIMITS, type AppAIErrorKind, type AppAIModel, type AppAITask, type AppManifest } from "./types";

/** サーバーが受け取る画像（base64）。種類は中身から決める */
export type AiImageInput = { base64: string };
export type AiCallInput = { text?: string; images?: AiImageInput[] };

export type AiUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
export type AiOutcome =
  | { ok: true; data: unknown; model: string; usage: AiUsage }
  | { ok: false; kind: AppAIErrorKind; message: string; usage?: AiUsage };

/** 使うクライアントの形（テストでは差し替える） */
export type AiClient = Pick<Anthropic, "messages" | "beta">;

export function createAiClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
}

/** 料金（1M トークンあたりの米ドル。2026-10 時点。運用者が月の費用の上限の計算に使う） */
export const AI_PRICES_USD_PER_MTOK: Record<AppAIModel, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export function estimateCostUsd(model: AppAIModel, u: AiUsage): number {
  const p = AI_PRICES_USD_PER_MTOK[model];
  return (u.inputTokens * p.input + u.cacheWriteTokens * p.input * 1.25 + u.cacheReadTokens * p.cacheRead + u.outputTokens * p.output) / 1_000_000;
}

/** 画像の種類を、先頭のバイトで決める（申告された種類は信じない） */
export function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

const fail = (kind: AppAIErrorKind, message: string, usage?: AiUsage): AiOutcome => ({ ok: false, kind, message, usage });

/** 入力を確かめ、Claude に渡す形にする。だめなら失敗を返す */
export function prepareInput(
  task: AppAITask,
  input: AiCallInput,
): { ok: true; text: string; images: { mediaType: string; base64: string }[] } | { ok: false; outcome: AiOutcome } {
  const text = typeof input.text === "string" ? input.text : "";
  const maxText = Math.min(task.maxTextChars ?? APP_AI_LIMITS.defaultTextChars, APP_AI_LIMITS.maxTextChars);
  if (text.length > maxText) return { ok: false, outcome: fail("invalid_input", `文字は ${maxText} 文字までです`) };
  const rawImages = Array.isArray(input.images) ? input.images : [];
  const maxImages = Math.min(task.maxImages ?? 0, APP_AI_LIMITS.maxImages);
  if (rawImages.length > maxImages) {
    return { ok: false, outcome: fail("invalid_input", maxImages === 0 ? "この仕事には画像を送れません" : `画像は ${maxImages} 枚までです`) };
  }
  const images: { mediaType: string; base64: string }[] = [];
  for (const img of rawImages) {
    if (!img || typeof img.base64 !== "string") return { ok: false, outcome: fail("invalid_input", "画像の形が正しくありません") };
    const bytes = Buffer.from(img.base64, "base64");
    if (bytes.length === 0 || bytes.length > APP_AI_LIMITS.maxImageBytes) {
      return { ok: false, outcome: fail("invalid_input", `画像は 1 枚 ${APP_AI_LIMITS.maxImageBytes / 1024 / 1024} MB までです`) };
    }
    const mediaType = detectImageType(bytes);
    if (!mediaType) return { ok: false, outcome: fail("invalid_input", "画像は JPEG、PNG、WebP、GIF にしてください") };
    images.push({ mediaType, base64: bytes.toString("base64") });
  }
  if (!text.trim() && images.length === 0) return { ok: false, outcome: fail("invalid_input", "送る内容がありません") };
  return { ok: true, text, images };
}

function usageOf(u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined): AiUsage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
  };
}

/** SDK のエラーを、アプリに返す種類にする。ログには種類と状態コードだけを出す */
function fromError(e: unknown, log: (line: string) => void): AiOutcome {
  if (e instanceof Anthropic.APIError) {
    log(`AI の呼び出しに失敗しました（${e.constructor.name}${e.status ? ` ${e.status}` : ""}）`);
    if (e instanceof Anthropic.RateLimitError) return fail("unavailable", "AI が混み合っています。少し時間をおいてお試しください");
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      return fail("unavailable", "AI の設定に問題があり、今は使えません");
    }
    if (e instanceof Anthropic.APIConnectionError) return fail("unavailable", "AI につながりませんでした");
    return fail("unavailable", "AI からエラーが返りました。時間をおいてお試しください");
  }
  log(`AI の呼び出しに失敗しました（${e instanceof Error ? e.name : typeof e}）`);
  return fail("unavailable", "AI につながりませんでした");
}

/**
 * AI の仕事を実行する。入力の確かめ、リクエストの組み立て、返事の確かめ（構造化出力と zod）まで行う。
 * 回数や費用の上限、同意の確かめは呼ぶ側（本体の API、キットのサーバー）が行う
 */
export async function runAiTask(opts: {
  client: AiClient;
  manifest: AppManifest;
  task: AppAITask;
  input: AiCallInput;
  log?: (line: string) => void;
}): Promise<AiOutcome> {
  const log = opts.log ?? (() => {});
  const prepared = prepareInput(opts.task, opts.input);
  if (!prepared.ok) return prepared.outcome;
  const model = opts.manifest.ai?.model ?? APP_AI_DEFAULT_MODEL;
  const content: Anthropic.ContentBlockParam[] = [
    ...prepared.images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType as Anthropic.Base64ImageSource["media_type"], data: img.base64 },
      }),
    ),
    { type: "text", text: prepared.text.trim() ? prepared.text : "（文字の入力はありません）" },
  ];
  const base = {
    model,
    max_tokens: Math.min(opts.task.maxOutputTokens ?? APP_AI_LIMITS.defaultOutputTokens, APP_AI_LIMITS.maxOutputTokens),
    system: opts.task.instructions,
    messages: [{ role: "user" as const, content }],
    output_config: {
      effort: opts.task.effort ?? "low",
      format: { type: "json_schema" as const, schema: taskOutputJsonSchema(opts.task) },
    },
  };

  let res: { stop_reason: string | null; content: Array<{ type: string; text?: string }>; usage: Parameters<typeof usageOf>[0]; model: string };
  try {
    if (model === "claude-haiku-5-5") {
      // Haiku には server-side fallback がない
      res = await opts.client.messages.create({ ...base, stream: false });
    } else {
      // Opus / Sonnet: 安全のために断られたら、別のモデルで続ける（server-side fallback。"default" は断られた理由で行き先を選ぶ）
      res = await opts.client.beta.messages.create({
        ...base,
        stream: false,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    }
  } catch (e) {
    return fromError(e, log);
  }
  const usage = usageOf(res.usage);
  if (res.stop_reason === "refusal") return fail("refusal", "AI が応えられない内容でした", usage);
  if (res.stop_reason === "max_tokens") return fail("invalid_output", "AI の返事が長すぎました", usage);
  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock?.text) return fail("invalid_output", "AI の返事を読み取れませんでした", usage);
  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return fail("invalid_output", "AI の返事を読み取れませんでした", usage);
  }
  const checked = opts.task.output.safeParse(parsed);
  if (!checked.success) return fail("invalid_output", "AI の返事の形が正しくありませんでした", usage);
  return { ok: true, data: checked.data, model: res.model, usage };
}
