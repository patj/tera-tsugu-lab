// ケアのツール（tools/<tool-id>/）の一覧の生成と、規約のチェック。spec.md §7、tools/CLAUDE.md
//   npm run tools:gen    一覧（src/care-sdk/registry.generated.ts と views.generated.ts）を作り直す
//   npm run tools:check  規約違反を探す（公開の前に必ず流す）。一覧が古い場合も知らせる
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..");
const TOOLS_DIR = "tools";
const REGISTRY_FILE = "src/care-sdk/registry.generated.ts";
const VIEWS_FILE = "src/care-sdk/views.generated.ts";

export const REQUIRED_FILES = ["manifest.ts", "schema.ts", "Entry.tsx", "History.tsx", "AdminView.tsx", "README.md"];
const TOOL_ID = /^[a-z0-9][a-z0-9-]*$/;
const FIELD_ID = /^[a-z][a-z0-9_]*$/;
const ALLOWED_IMPORTS = new Set(["react", "zod", "@/care-sdk"]);

/** 外部への送信、DB や環境への直接のアクセス、危険な書き方 */
const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bfetch\s*\(/, reason: "fetch で外部に送信しない" },
  { pattern: /\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b/, reason: "外部に送信しない" },
  { pattern: /https?:\/\//, reason: "外部の URL を使わない（画像やリンクも、読み込むだけで外部に伝わる）" },
  { pattern: /\bprocess\.env\b/, reason: "環境変数を読まない" },
  { pattern: /\beval\s*\(|\bnew\s+Function\b/, reason: "eval / new Function を使わない" },
  { pattern: /["']use server["']/, reason: "サーバーの処理（Server Actions）を作らない。保存は本体が行う" },
  { pattern: /dangerouslySetInnerHTML/, reason: "dangerouslySetInnerHTML を使わない" },
  { pattern: /<script\b|<iframe\b/, reason: "<script> / <iframe> を使わない" },
  { pattern: /\bdocument\.cookie\b|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, reason: "端末に記録を保存しない（記録は本体が暗号化して保存する）" },
  { pattern: /\brequire\s*\(/, reason: "require を使わない（import を使う）" },
];

/** 診断的な表現（ツールは診断・治療を行わない。spec.md §7） */
const DIAGNOSTIC_WORDS = ["診断", "うつ病", "鬱病", "うつ状態", "重症", "軽症", "障害", "治療", "症状", "病名", "処方", "依存症"];

export type Problem = { tool: string; file?: string; message: string };

export function listToolDirs(root = ROOT): string[] {
  const dir = path.join(root, TOOLS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => statSync(path.join(dir, name)).isDirectory())
    .sort();
}

/** 一覧に載せるツール（_ で始まるもの、ひな形は載せない） */
export function listPublishedTools(root = ROOT): string[] {
  return listToolDirs(root).filter((name) => !name.startsWith("_"));
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

/** コメントを除く（// と /* *\/。文字列の中の // は URL のチェックのために残したいので、行頭の // と /* *\/ だけ） */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function importsOf(src: string): string[] {
  const out: string[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
  for (let m = re.exec(src); m; m = re.exec(src)) out.push(m[1]);
  return out;
}

/** ソースの規約（import、禁止の書き方、診断的な表現）。manifest の中身は checkManifest で見る */
export function checkToolSources(toolDir: string, tool: string): Problem[] {
  const problems: Problem[] = [];
  for (const file of sourceFiles(toolDir)) {
    const rel = path.relative(toolDir, file);
    const src = stripComments(readFileSync(file, "utf8"));
    for (const spec of importsOf(src)) {
      if (spec.startsWith(".")) {
        const resolved = path.resolve(path.dirname(file), spec);
        if (resolved !== toolDir && !resolved.startsWith(toolDir + path.sep)) {
          problems.push({ tool, file: rel, message: `ツールのディレクトリの外を import しない: ${spec}` });
        }
      } else if (!ALLOWED_IMPORTS.has(spec)) {
        problems.push({ tool, file: rel, message: `import できるのは @/care-sdk、react、zod、自分のディレクトリのファイルだけ: ${spec}` });
      }
    }
    for (const f of FORBIDDEN) {
      if (f.pattern.test(src)) problems.push({ tool, file: rel, message: f.reason });
    }
    for (const w of DIAGNOSTIC_WORDS) {
      if (src.includes(w)) problems.push({ tool, file: rel, message: `診断的な表現をしない: 「${w}」` });
    }
  }
  return problems;
}

/** manifest と schema の中身（読み込んで確かめる） */
export async function checkManifest(toolDir: string, tool: string): Promise<Problem[]> {
  const problems: Problem[] = [];
  const add = (message: string, file = "manifest.ts") => problems.push({ tool, file, message });
  let manifest: { id?: unknown; name?: unknown; description?: unknown; icon?: unknown; fields?: unknown };
  let schema: unknown;
  try {
    manifest = (await import(path.join(toolDir, "manifest.ts"))).manifest;
    schema = (await import(path.join(toolDir, "schema.ts"))).schema;
  } catch (e) {
    add(`manifest.ts / schema.ts を読み込めません: ${(e as Error).message}`);
    return problems;
  }
  if (!manifest || typeof manifest !== "object") {
    add("manifest を export してください（export const manifest = defineCareManifest({...})）");
    return problems;
  }
  const isTemplate = tool.startsWith("_");
  if (!isTemplate && manifest.id !== tool) add(`manifest の id（${String(manifest.id)}）をディレクトリの名前（${tool}）と同じにしてください`);
  for (const key of ["name", "description", "icon"] as const) {
    if (typeof manifest[key] !== "string" || !(manifest[key] as string).trim()) add(`manifest の ${key} を書いてください`);
  }
  const fields = Array.isArray(manifest.fields) ? (manifest.fields as Record<string, unknown>[]) : [];
  if (fields.length === 0) add("manifest の fields に項目を 1 つ以上書いてください");
  const ids = new Set<string>();
  for (const f of fields) {
    const id = String(f.id);
    if (!FIELD_ID.test(id)) add(`項目の id は英小文字・数字・_ にしてください: ${id}`);
    if (ids.has(id)) add(`項目の id が重複しています: ${id}`);
    ids.add(id);
    if (!["text", "textarea", "scale", "choice"].includes(String(f.type))) add(`項目の type が不明です: ${id}（${String(f.type)}）`);
    if ("crisis" in f && f.crisis === false && (f.type === "text" || f.type === "textarea")) {
      add(`自由記述の項目は危機検知の対象から外せません: ${id}`);
    }
    if (f.type === "scale" && !(Number(f.min) < Number(f.max))) add(`scale の min は max より小さくしてください: ${id}`);
    if (f.type === "choice" && (!Array.isArray(f.options) || f.options.length === 0)) add(`choice の options を書いてください: ${id}`);
  }
  const shape = (schema as { shape?: Record<string, unknown> } | undefined)?.shape;
  if (!shape) {
    add("schema.ts で、zod の z.object(...) を schema として export してください", "schema.ts");
  } else {
    const keys = new Set(Object.keys(shape));
    for (const id of ids) if (!keys.has(id)) add(`schema に項目 ${id} がありません`, "schema.ts");
    for (const k of keys) if (!ids.has(k)) add(`manifest にない項目が schema にあります: ${k}`, "schema.ts");
  }
  return problems;
}

export function renderRegistry(tools: string[]): { registry: string; views: string } {
  const head = "// このファイルは npm run tools:gen が生成する。手で書き換えない（scripts/care-tools.ts）\n";
  const reg = [
    head,
    `import type { CareToolDefinition } from "./types";`,
    ...tools.flatMap((t, i) => [
      `import { manifest as manifest${i} } from "../../tools/${t}/manifest";`,
      `import { schema as schema${i} } from "../../tools/${t}/schema";`,
    ]),
    "",
    "/** ケアのツールの manifest と schema（ドメイン層が使う） */",
    "export const CARE_TOOL_DEFINITIONS: CareToolDefinition[] = [",
    ...tools.map((_, i) => `  { manifest: manifest${i}, schema: schema${i} },`),
    "];",
    "",
  ].join("\n");
  const views = [
    head,
    `import type { CareToolViews } from "./types";`,
    ...tools.flatMap((t, i) => [
      `import Entry${i} from "../../tools/${t}/Entry";`,
      `import History${i} from "../../tools/${t}/History";`,
      `import AdminView${i} from "../../tools/${t}/AdminView";`,
    ]),
    "",
    "/** ケアのツールの画面（ケアのポータルと管理画面が使う） */",
    "export const CARE_TOOL_VIEWS: Record<string, CareToolViews> = {",
    ...tools.map((t, i) => `  ${JSON.stringify(t)}: { Entry: Entry${i}, History: History${i}, AdminView: AdminView${i} },`),
    "};",
    "",
  ].join("\n");
  return { registry: reg, views };
}

export function generate(root = ROOT): void {
  const { registry, views } = renderRegistry(listPublishedTools(root));
  writeFileSync(path.join(root, REGISTRY_FILE), registry);
  writeFileSync(path.join(root, VIEWS_FILE), views);
}

export async function check(root = ROOT): Promise<Problem[]> {
  const problems: Problem[] = [];
  for (const tool of listToolDirs(root)) {
    const dir = path.join(root, TOOLS_DIR, tool);
    if (!TOOL_ID.test(tool) && !tool.startsWith("_")) {
      problems.push({ tool, message: "ディレクトリの名前は英小文字・数字・- にしてください" });
    }
    for (const f of REQUIRED_FILES) {
      if (!existsSync(path.join(dir, f))) problems.push({ tool, file: f, message: "必要なファイルがありません" });
    }
    problems.push(...checkToolSources(dir, tool));
    if (existsSync(path.join(dir, "manifest.ts")) && existsSync(path.join(dir, "schema.ts"))) {
      problems.push(...(await checkManifest(dir, tool)));
    }
  }
  const { registry, views } = renderRegistry(listPublishedTools(root));
  const read = (f: string) => (existsSync(path.join(root, f)) ? readFileSync(path.join(root, f), "utf8") : "");
  if (read(REGISTRY_FILE) !== registry || read(VIEWS_FILE) !== views) {
    problems.push({ tool: "(一覧)", message: "ツールの一覧が古くなっています。npm run tools:gen を流してください" });
  }
  return problems;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "gen") {
    generate();
    console.log(`ケアのツールの一覧を作りました: ${listPublishedTools().join(", ") || "（なし）"}`);
    return;
  }
  if (cmd === "check") {
    const problems = await check();
    if (problems.length === 0) {
      console.log(`規約違反はありません（${listToolDirs().join(", ")}）`);
      return;
    }
    for (const p of problems) console.error(`✗ tools/${p.tool}${p.file ? `/${p.file}` : ""}: ${p.message}`);
    console.error(`\n${problems.length} 件の規約違反があります（tools/CLAUDE.md を参照）`);
    process.exit(1);
  }
  console.error("使い方: tsx scripts/care-tools.ts gen | check");
  process.exit(2);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
