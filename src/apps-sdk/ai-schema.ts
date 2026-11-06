// AI の仕事の返事の形（zod）を、Claude の構造化出力（output_config.format）の JSON Schema にする。spec.md §7「AI」
// - 選択肢（enum / const）はそのまま渡し、API に守らせる
// - API が守らせられない制約（長さ、範囲、パターンなど）は、説明（description）に移して伝える。基盤があとで zod で確かめる
// - SDK の zodOutputFormat は enum まで説明に移すため使わない（spec.md §7「検討して採らなかった案」）
// このファイルは、本体（apps:check、AI の中継）と開発キットで共通（npm run kit:build でコピーする）
import { z } from "zod";
import { APP_AI_EFFORTS, APP_AI_LIMITS, type AppAITask } from "./types";

type JsonSchema = { [key: string]: unknown };

/** API に渡さず、説明に移すキーワード */
const MOVE_TO_DESCRIPTION = [
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
];
/** 渡さないキーワード */
const DROP = ["$schema", "$id", "default", "examples", "title"];

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (!node || typeof node !== "object") return node;
  const src = node as JsonSchema;
  if ("additionalProperties" in src && src.additionalProperties !== false) {
    throw new Error("キーの決まっていないオブジェクト（z.record、z.looseObject など）は使えません");
  }
  const out: JsonSchema = {};
  const moved: string[] = [];
  for (const [k, v] of Object.entries(src)) {
    if (DROP.includes(k)) continue;
    if (MOVE_TO_DESCRIPTION.includes(k)) {
      moved.push(`${k}: ${JSON.stringify(v)}`);
      continue;
    }
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as JsonSchema).map(([pk, pv]) => [pk, sanitize(pv)])) : sanitize(v);
  }
  if (out.type === "object" || out.properties) {
    out.additionalProperties = false;
  }
  if (moved.length > 0) {
    out.description = [out.description, `{${moved.join(", ")}}`].filter(Boolean).join(" ");
  }
  return out;
}

/** AI の仕事の返事の形を JSON Schema にする。できない形（transform、record など）なら例外を投げる */
export function taskOutputJsonSchema(task: Pick<AppAITask, "output">): JsonSchema {
  const raw = z.toJSONSchema(task.output, { target: "draft-2020-12", io: "output", unrepresentable: "throw" }) as JsonSchema;
  const schema = sanitize(raw) as JsonSchema;
  if (schema.type !== "object") throw new Error("返事の形（output）は z.object(...) にしてください");
  return schema;
}

/** AI の仕事の宣言の誤り（apps:check と、呼び出しの前に使う） */
export function taskProblems(name: string, task: unknown): string[] {
  const problems: string[] = [];
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) problems.push(`AI の仕事の名前は英字で始まる英数字と _ にしてください: ${name}`);
  if (!task || typeof task !== "object") return [...problems, `AI の仕事 ${name} の形が正しくありません`];
  const t = task as Partial<AppAITask>;
  if (typeof t.instructions !== "string" || !t.instructions.trim()) problems.push(`AI の仕事 ${name} の instructions を書いてください`);
  if (!(t.output instanceof z.ZodType)) {
    problems.push(`AI の仕事 ${name} の output を zod（z.object(...)）で書いてください`);
  } else {
    try {
      taskOutputJsonSchema(t as AppAITask);
    } catch (e) {
      problems.push(`AI の仕事 ${name} の output を JSON Schema にできません（${(e as Error).message}）。transform や record などを使わないでください`);
    }
  }
  const intIn = (v: unknown, min: number, max: number) => v === undefined || (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max);
  if (!intIn(t.maxTextChars, 1, APP_AI_LIMITS.maxTextChars)) problems.push(`AI の仕事 ${name} の maxTextChars は 1〜${APP_AI_LIMITS.maxTextChars} にしてください`);
  if (!intIn(t.maxImages, 0, APP_AI_LIMITS.maxImages)) problems.push(`AI の仕事 ${name} の maxImages は 0〜${APP_AI_LIMITS.maxImages} にしてください`);
  if (!intIn(t.maxOutputTokens, 1000, APP_AI_LIMITS.maxOutputTokens)) {
    problems.push(`AI の仕事 ${name} の maxOutputTokens は 1000〜${APP_AI_LIMITS.maxOutputTokens} にしてください`);
  }
  if (t.effort !== undefined && !(APP_AI_EFFORTS as readonly string[]).includes(t.effort)) {
    problems.push(`AI の仕事 ${name} の effort は ${APP_AI_EFFORTS.join(" / ")} のどれかにしてください`);
  }
  return problems;
}
