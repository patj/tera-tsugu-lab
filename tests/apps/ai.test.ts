// お寺のアプリの AI: 返事の形の変換、入力の確かめ、Claude の呼び出し（クライアントは差し替え。本物の API は呼ばない）
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { taskOutputJsonSchema, taskProblems } from "@/apps-sdk/ai-schema";
import { detectImageType, estimateCostUsd, prepareInput, runAiTask, type AiClient } from "@/apps-sdk/ai-server";
import { appAIConsentVersion, defineAppAI, defineAppManifest, type AppManifest } from "@/apps-sdk/types";

const output = z.object({
  emotion: z.enum(["joy", "sad"]),
  intensity: z.number().min(0).max(1),
  tags: z.array(z.enum(["仕事", "家族"])).max(3),
  name: z.string().max(20),
});
const tasks = defineAppAI({ tailor: { instructions: "あなたは仕立て屋です。", output, maxImages: 1, maxTextChars: 100 } });
const manifest = (model?: AppManifest["ai"] extends infer A ? (A extends { model?: infer M } ? M : never) : never) =>
  defineAppManifest({ id: "t", name: "t", description: "t", icon: "t", sharing: false, ai: { purpose: "服を選ぶため", sends: ["日記の文字"], model } });

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]).toString("base64");

type Call = { api: "messages" | "beta"; params: Record<string, unknown> };
function fakeClient(reply: (call: Call) => unknown): { client: AiClient; calls: Call[] } {
  const calls: Call[] = [];
  const handler = (api: Call["api"]) => async (params: Record<string, unknown>) => {
    const call = { api, params };
    calls.push(call);
    const r = reply(call);
    if (r instanceof Error) throw r;
    return r;
  };
  return { client: { messages: { create: handler("messages") }, beta: { messages: { create: handler("beta") } } } as unknown as AiClient, calls };
}
const message = (text: string, stop_reason = "end_turn") => ({
  model: "claude-sonnet-5-5",
  stop_reason,
  content: [{ type: "thinking", thinking: "" }, { type: "text", text }],
  usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});
const good = JSON.stringify({ emotion: "sad", intensity: 0.7, tags: ["仕事"], name: "雨宿りのコート" });

describe("返事の形（JSON Schema）", () => {
  it("選択肢は残し、長さや範囲は説明に移し、キーを固定する", () => {
    const s = taskOutputJsonSchema({ output }) as { properties: Record<string, Record<string, unknown>>; additionalProperties: boolean; required: string[] };
    assert.deepEqual(s.properties.emotion.enum, ["joy", "sad"]);
    assert.deepEqual((s.properties.tags.items as { enum: string[] }).enum, ["仕事", "家族"]);
    assert.equal(s.properties.intensity.maximum, undefined);
    assert.match(String(s.properties.intensity.description), /maximum: 1/);
    assert.match(String(s.properties.name.description), /maxLength: 20/);
    assert.equal(s.additionalProperties, false);
    assert.deepEqual(s.required.sort(), ["emotion", "intensity", "name", "tags"]);
    assert.equal((s as Record<string, unknown>).$schema, undefined);
  });

  it("JSON Schema にできない形（transform、record）と、上限を超える宣言を知らせる", () => {
    assert.match(taskProblems("a", { instructions: "x", output: z.object({ a: z.string().transform((v) => v.length) }) }).join(), /JSON Schema にできません/);
    assert.match(taskProblems("a", { instructions: "x", output: z.object({ r: z.record(z.string(), z.string()) }) }).join(), /JSON Schema にできません/);
    assert.match(taskProblems("a", { instructions: "x", output: z.string() }).join(), /z\.object/);
    assert.match(taskProblems("a", { instructions: "", output }).join(), /instructions/);
    assert.match(taskProblems("a", { instructions: "x", output, maxImages: 9 }).join(), /maxImages/);
    assert.match(taskProblems("bad-name", { instructions: "x", output }).join(), /名前/);
    assert.deepEqual(taskProblems("tailor", tasks.tailor), []);
  });
});

describe("入力", () => {
  it("画像の種類は中身で決める（申告を信じない）", () => {
    assert.equal(detectImageType(Buffer.from(PNG, "base64")), "image/png");
    assert.equal(detectImageType(Buffer.from(JPEG, "base64")), "image/jpeg");
    assert.equal(detectImageType(Buffer.from("<svg onload=alert(1)>")), null);
  });

  it("文字の長さ、画像の枚数と種類、空の入力を断る", () => {
    const t = tasks.tailor;
    assert.equal(prepareInput(t, { text: "あ".repeat(101) }).ok, false);
    assert.equal(prepareInput(t, { text: "x", images: [{ base64: PNG }, { base64: PNG }] }).ok, false);
    assert.equal(prepareInput(t, { text: "x", images: [{ base64: Buffer.from("<svg/>").toString("base64") }] }).ok, false);
    assert.equal(prepareInput(t, { text: "  " }).ok, false);
    const ok = prepareInput(t, { text: "雨", images: [{ base64: JPEG }] });
    assert.ok(ok.ok && ok.images[0].mediaType === "image/jpeg");
  });
});

describe("Claude の呼び出し", () => {
  it("リクエストは基盤が組み立てる（指示、利用者の入力、構造化出力、effort、Opus / Sonnet では fallback）", async () => {
    const { client, calls } = fakeClient(() => message(good));
    const r = await runAiTask({ client, manifest: manifest("claude-sonnet-5-5"), task: tasks.tailor, input: { text: "今日は雨", images: [{ base64: JPEG }] } });
    assert.ok(r.ok);
    assert.deepEqual(r.ok && r.data, JSON.parse(good));
    assert.equal(calls.length, 1);
    const p = calls[0].params as Record<string, unknown> & { messages: { content: { type: string }[] }[]; output_config: { effort: string; format: { type: string } } };
    assert.equal(calls[0].api, "beta");
    assert.equal(p.model, "claude-sonnet-5-5");
    assert.equal(p.system, "あなたは仕立て屋です。");
    assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
    assert.equal(p.fallbacks, "default");
    assert.equal(p.output_config.effort, "low");
    assert.equal(p.output_config.format.type, "json_schema");
    assert.deepEqual(p.messages[0].content.map((c) => c.type), ["image", "text"]);
    for (const k of ["tools", "tool_choice", "temperature", "thinking"]) assert.equal(p[k], undefined, k);
  });

  it("モデルの初期値は Opus 5.5。Haiku は fallback なしの呼び出し", async () => {
    const a = fakeClient(() => message(good));
    await runAiTask({ client: a.client, manifest: manifest(), task: tasks.tailor, input: { text: "x" } });
    assert.equal(a.calls[0].params.model, "claude-opus-5-5");
    const b = fakeClient(() => message(good));
    await runAiTask({ client: b.client, manifest: manifest("claude-haiku-5-5"), task: tasks.tailor, input: { text: "x" } });
    assert.equal(b.calls[0].api, "messages");
    assert.equal(b.calls[0].params.fallbacks, undefined);
  });

  it("断られた、長すぎた、形が違う、読み取れない返事を、それぞれの種類で返す", async () => {
    const cases: [unknown, string][] = [
      [message("", "refusal"), "refusal"],
      [message("{", "max_tokens"), "invalid_output"],
      [message("not json"), "invalid_output"],
      [message(JSON.stringify({ emotion: "angry", intensity: 2, tags: [], name: "x" })), "invalid_output"],
      [message(JSON.stringify({ emotion: "sad", intensity: 0.5, tags: [], name: "あ".repeat(21) })), "invalid_output"],
    ];
    for (const [reply, kind] of cases) {
      const { client } = fakeClient(() => reply);
      const r = await runAiTask({ client, manifest: manifest(), task: tasks.tailor, input: { text: "x" } });
      assert.equal(!r.ok && r.kind, kind);
      assert.ok(r.usage, "使ったトークン数は失敗しても返す（費用の計算のため）");
    }
  });

  it("SDK のエラーは unavailable にし、ログには種類と状態コードだけを出す（入力を出さない）", async () => {
    const lines: string[] = [];
    const { client } = fakeClient(() => new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers()));
    const r = await runAiTask({ client, manifest: manifest(), task: tasks.tailor, input: { text: "とても秘密の日記" }, log: (l) => lines.push(l) });
    assert.equal(!r.ok && r.kind, "unavailable");
    assert.equal(lines.length, 1);
    assert.ok(!lines[0].includes("秘密"));
    assert.match(lines[0], /RateLimitError 429/);
  });

  it("入力が正しくなければ、Claude を呼ばない", async () => {
    const { client, calls } = fakeClient(() => message(good));
    const r = await runAiTask({ client, manifest: manifest(), task: tasks.tailor, input: { text: "x".repeat(500) } });
    assert.equal(!r.ok && r.kind, "invalid_input");
    assert.equal(calls.length, 0);
  });
});

describe("同意の版と費用", () => {
  it("purpose か sends が変わると同意の版が変わる（並び順は関係ない）", () => {
    const base = manifest();
    const v = appAIConsentVersion(base);
    assert.equal(appAIConsentVersion({ ...base, ai: { ...base.ai!, sends: [...base.ai!.sends].reverse() } }), v);
    assert.notEqual(appAIConsentVersion({ ...base, ai: { ...base.ai!, sends: ["日記の文字", "写真"] } }), v);
    assert.notEqual(appAIConsentVersion({ ...base, ai: { ...base.ai!, purpose: "別の目的" } }), v);
    assert.equal(appAIConsentVersion({ ...base, ai: undefined }), "");
  });

  it("費用はモデルの料金表で計算する", () => {
    const u = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 };
    assert.equal(estimateCostUsd("claude-sonnet-5-5", u), 12);
    assert.equal(estimateCostUsd("claude-opus-5-5", u), 24);
  });
});
