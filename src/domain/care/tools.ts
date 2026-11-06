// ケアのツールの一覧（npm run tools:gen が生成した registry を使う）と、記録の検証
import type { z } from "zod";
import { CARE_TOOL_DEFINITIONS } from "@/care-sdk/registry.generated";
import type { CareEntryData, CareManifest, CareToolDefinition } from "@/care-sdk/types";
import { invalid, notFound } from "../core/errors";

let tools: CareToolDefinition[] = CARE_TOOL_DEFINITIONS;

/** テスト用: ツールの一覧を差し替える（tests/care/ でテスト用のツールを使うため） */
export function setCareToolsForTesting(defs: CareToolDefinition[] | null): void {
  tools = defs ?? CARE_TOOL_DEFINITIONS;
}

export function listCareTools(): CareManifest[] {
  return tools.map((t) => t.manifest);
}

export function findCareTool(toolId: string): CareToolDefinition | undefined {
  return tools.find((t) => t.manifest.id === toolId);
}

export function getCareTool(toolId: string): CareToolDefinition {
  const t = findCareTool(toolId);
  if (!t) throw notFound("ツールが見つかりません");
  return t;
}

/** フォームの値を、manifest の項目の型に合わせて取り出す（manifest にない値は捨てる） */
export function careDataFromForm(manifest: CareManifest, form: FormData): CareEntryData {
  const data: CareEntryData = {};
  for (const f of manifest.fields) {
    const raw = form.get(f.id);
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s === "") continue;
    data[f.id] = f.type === "scale" ? Number(s) : s;
  }
  return data;
}

/** manifest の決まり（必須、範囲、選択肢、長さ）と、ツールの schema（zod）で検証する。エラーには本文を入れない */
export function validateCareData(tool: CareToolDefinition, input: CareEntryData): CareEntryData {
  const { manifest } = tool;
  const data: CareEntryData = {};
  for (const f of manifest.fields) {
    const v = input[f.id];
    if (v === undefined || v === "") {
      if (f.required) throw invalid(`「${f.label}」を入力してください`);
      continue;
    }
    if (f.type === "scale") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < f.min || n > f.max) throw invalid(`「${f.label}」は ${f.min}〜${f.max} から選んでください`);
      data[f.id] = n;
    } else if (f.type === "choice") {
      if (!f.options.some((o) => o.value === v)) throw invalid(`「${f.label}」は選択肢から選んでください`);
      data[f.id] = String(v);
    } else {
      const s = String(v);
      const max = f.maxLength ?? (f.type === "text" ? 200 : 4000);
      if (s.length > max) throw invalid(`「${f.label}」は ${max} 文字以内にしてください`);
      data[f.id] = s;
    }
  }
  const r = (tool.schema as z.ZodType).safeParse(data);
  if (!r.success) {
    const field = r.error.issues[0]?.path[0];
    const label = manifest.fields.find((f) => f.id === field)?.label;
    throw invalid(label ? `「${label}」の入力を確かめてください` : "入力を確かめてください");
  }
  return r.data as CareEntryData;
}
