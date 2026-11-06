// お寺のアプリ（apps/<app-id>/）の一覧の生成と、規約のチェック。spec.md §7、apps/CLAUDE.md
//   npm run apps:gen    一覧（src/apps-sdk/registry.generated.ts と views.generated.ts）を作り直し、素材を public/app-assets/ に写す
//   npm run apps:check  規約違反を探す（公開の前に必ず流す）。一覧が古い場合も知らせる
// ※ 正規表現のチェックなので、うっかりした違反は見つけられるが、悪意のある書き方までは防げない（公開の前に人がコードを読む）
// このファイルは、開発キット（kit/）にもそのままコピーされる（npm run kit:build）。@/apps-sdk/* は、本体では src/apps-sdk、キットでは sdk を指す
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { taskProblems } from "@/apps-sdk/ai-schema";
import {
  APP_AI_LIMITS,
  APP_AI_MODELS,
  APP_ASSET_EXTENSIONS,
  APP_ASSET_MAX_FILE_BYTES,
  APP_ASSET_MAX_TOTAL_BYTES,
  APP_DOCUMENTS_MAX_LIMIT,
} from "@/apps-sdk/types";

export const ROOT = path.resolve(__dirname, "..");
const APPS_DIR = "apps";
const REGISTRY_FILE = "src/apps-sdk/registry.generated.ts";
const VIEWS_FILE = "src/apps-sdk/views.generated.ts";
/** 本体が素材を配信する場所（apps:gen が写す。git の管理外） */
const PUBLIC_ASSETS_DIR = "public/app-assets";

export const REQUIRED_FILES = ["manifest.ts", "App.tsx", "README.md"];
const APP_ID = /^[a-z0-9][a-z0-9-]*$/;
/** URL（/apps/<app-id>）で本体が使う名前 */
const RESERVED_IDS = new Set(["api"]);
const ALLOWED_IMPORTS = new Set(["react", "zod", "@/apps-sdk"]);
/** ai.ts（サーバーで読み込まれる）が import できるもの */
const AI_ALLOWED_IMPORTS = new Set(["zod", "@/apps-sdk"]);
/** 外部の URL の決まりから外す、SVG の名前空間（通信はしない） */
const ALLOWED_URLS = ["http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink"];
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** 外部への送信、データや環境への直接のアクセス、危険な書き方 */
const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bfetch\s*\(/, reason: "fetch を使わない（データは useAppStorage、AI は useAppAI、素材は useAppAssets を使う。外部に送信しない）" },
  { pattern: /\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b/, reason: "外部に送信しない" },
  { pattern: /https?:\/\//, reason: "外部の URL を使わない（画像やリンクも、読み込むだけで外部に伝わる。素材は assets/ に置く）" },
  { pattern: /\bprocess\.env\b/, reason: "環境変数を読まない" },
  { pattern: /\beval\s*\(|\bnew\s+Function\b/, reason: "eval / new Function を使わない" },
  { pattern: /["']use server["']/, reason: "サーバーの処理（Server Actions）を作らない。保存は useAppStorage で行う" },
  { pattern: /dangerouslySetInnerHTML/, reason: "dangerouslySetInnerHTML を使わない" },
  { pattern: /<script\b|<iframe\b/, reason: "<script> / <iframe> を使わない" },
  { pattern: /\bdocument\.cookie\b|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, reason: "端末にデータを保存しない（useAppStorage を使う）" },
  { pattern: /\brequire\s*\(/, reason: "require を使わない（import を使う）" },
];

export type Problem = { app: string; file?: string; message: string };

export function listAppDirs(root = ROOT): string[] {
  const dir = path.join(root, APPS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => statSync(path.join(dir, name)).isDirectory())
    .sort();
}

/** 一覧に載せるアプリ（_ で始まるもの、ひな形は載せない） */
export function listPublishedApps(root = ROOT): string[] {
  return listAppDirs(root).filter((name) => !name.startsWith("_"));
}

/** アプリのファイル（assets/ の中は除く） */
function appFiles(dir: string, appDir = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (dir === appDir && name === "assets") continue;
      out.push(...appFiles(p, appDir));
    } else out.push(p);
  }
  return out;
}
const sourceFiles = (dir: string) => appFiles(dir).filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));

/** コメント（/* *\/ と、行頭の //）を除く */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function withoutAllowedUrls(src: string): string {
  return ALLOWED_URLS.reduce((s, u) => s.split(u).join(""), src);
}

function importsOf(src: string): string[] {
  const out: string[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
  for (let m = re.exec(src); m; m = re.exec(src)) out.push(m[1]);
  return out;
}

/** ソースの規約（import、禁止の書き方、CSS） */
export function checkAppSources(appDir: string, app: string): Problem[] {
  const problems: Problem[] = [];
  for (const file of appFiles(appDir)) {
    const rel = path.relative(appDir, file);
    const base = path.basename(file);
    if (base === ".DS_Store") continue;
    if (file.endsWith(".css")) {
      if (!file.endsWith(".module.css")) {
        problems.push({ app, file: rel, message: "CSS はアプリ専用の CSS Modules（*.module.css）にしてください（ほかの画面に影響するため）" });
        continue;
      }
      const css = withoutAllowedUrls(readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""));
      if (/:global\b/.test(css)) problems.push({ app, file: rel, message: ":global を使わない（ほかの画面に影響するため）" });
      if (/@import\b/.test(css)) problems.push({ app, file: rel, message: "CSS で @import を使わない" });
      if (/https?:\/\//.test(css)) problems.push({ app, file: rel, message: "外部の URL を使わない（素材は assets/ に置き、useAppAssets の url() を使う）" });
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) continue;
    const src = withoutAllowedUrls(stripComments(readFileSync(file, "utf8")));
    const isAi = rel === "ai.ts";
    for (const spec of importsOf(src)) {
      if (isAi) {
        if (!AI_ALLOWED_IMPORTS.has(spec)) problems.push({ app, file: rel, message: `ai.ts が import できるのは zod と @/apps-sdk だけ（サーバーで読み込まれるため）: ${spec}` });
        continue;
      }
      if (spec.startsWith(".")) {
        const resolved = path.resolve(path.dirname(file), spec);
        if (resolved !== appDir && !resolved.startsWith(appDir + path.sep)) {
          problems.push({ app, file: rel, message: `アプリのディレクトリの外を import しない: ${spec}` });
        } else if (spec.endsWith(".css") && !spec.endsWith(".module.css")) {
          problems.push({ app, file: rel, message: `CSS は *.module.css だけを import できます: ${spec}` });
        }
      } else if (!ALLOWED_IMPORTS.has(spec)) {
        problems.push({ app, file: rel, message: `import できるのは @/apps-sdk、react、zod、自分のディレクトリのファイルだけ: ${spec}` });
      }
    }
    for (const f of FORBIDDEN) {
      if (f.pattern.test(src)) problems.push({ app, file: rel, message: f.reason });
    }
  }
  return problems;
}

/** 素材（assets/）の種類と大きさ */
export function checkAssets(appDir: string, app: string): Problem[] {
  const problems: Problem[] = [];
  const dir = path.join(appDir, "assets");
  if (!existsSync(dir)) return problems;
  let total = 0;
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      const rel = path.relative(appDir, p);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (name === ".DS_Store") continue;
      const ext = path.extname(name).slice(1).toLowerCase();
      if (ext === "svg") {
        problems.push({ app, file: rel, message: "SVG は素材にできません（スクリプトが動くおそれがあるため）。SVG の絵はコンポーネントの中に書いてください" });
      } else if (!(APP_ASSET_EXTENSIONS as readonly string[]).includes(ext)) {
        problems.push({ app, file: rel, message: `素材にできるのは ${APP_ASSET_EXTENSIONS.join("、")} だけです` });
      }
      const size = statSync(p).size;
      total += size;
      if (size > APP_ASSET_MAX_FILE_BYTES) problems.push({ app, file: rel, message: `素材は 1 ファイル ${APP_ASSET_MAX_FILE_BYTES / 1024 / 1024} MB までです` });
    }
  };
  walk(dir);
  if (total > APP_ASSET_MAX_TOTAL_BYTES) problems.push({ app, file: "assets/", message: `素材は 1 アプリ ${APP_ASSET_MAX_TOTAL_BYTES / 1024 / 1024} MB までです` });
  return problems;
}

/** 使っている SDK の機能が、manifest の宣言と合っているか */
export function checkCapabilityUsage(appDir: string, app: string, caps: { sharing: boolean; ai: boolean }): Problem[] {
  const problems: Problem[] = [];
  for (const f of sourceFiles(appDir)) {
    const src = stripComments(readFileSync(f, "utf8"));
    const rel = path.relative(appDir, f);
    if (!caps.sharing && /\buseAppSharing\b/.test(src)) problems.push({ app, file: rel, message: "useAppSharing を使うときは、manifest の sharing を true にしてください" });
    if (!caps.ai && /\buseAppAI\b/.test(src)) problems.push({ app, file: rel, message: "useAppAI を使うときは、manifest に ai を書いてください" });
  }
  return problems;
}

/** 互換のため残す（sharing だけを確かめる） */
export function checkSharingUsage(appDir: string, app: string, sharing: boolean): Problem[] {
  return checkCapabilityUsage(appDir, app, { sharing, ai: true }).filter((p) => p.message.includes("useAppSharing"));
}

/** PNG の幅と高さ（IHDR） */
function pngSize(file: string): { width: number; height: number } | null {
  const b = readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

export type ManifestCheck = { problems: Problem[]; sharing: boolean; ai: boolean };

/** manifest の中身（読み込んで確かめる） */
export async function checkManifest(appDir: string, app: string): Promise<ManifestCheck> {
  const problems: Problem[] = [];
  const add = (message: string) => problems.push({ app, file: "manifest.ts", message });
  let manifest: Record<string, unknown> | undefined;
  try {
    // Windows の C:\... のパスでも読めるよう、file:// の URL にして import する
    manifest = (await import(pathToFileURL(path.join(appDir, "manifest.ts")).href)).manifest;
  } catch (e) {
    add(`manifest.ts を読み込めません: ${(e as Error).message}`);
    return { problems, sharing: false, ai: false };
  }
  if (!manifest || typeof manifest !== "object") {
    add("manifest を export してください（export const manifest = defineAppManifest({...})）");
    return { problems, sharing: false, ai: false };
  }
  if (!app.startsWith("_") && manifest.id !== app) add(`manifest の id（${String(manifest.id)}）をディレクトリの名前（${app}）と同じにしてください`);
  for (const key of ["name", "description", "icon"]) {
    if (typeof manifest[key] !== "string" || !(manifest[key] as string).trim()) add(`manifest の ${key} を書いてください`);
  }
  if (typeof manifest.sharing !== "boolean") add("manifest の sharing を true か false にしてください");
  if (manifest.display !== undefined && manifest.display !== "framed" && manifest.display !== "fullscreen") {
    add('manifest の display は "framed" か "fullscreen" にしてください');
  }
  if (manifest.pwa !== undefined) {
    const pwa = manifest.pwa as Record<string, unknown>;
    for (const key of ["themeColor", "backgroundColor"]) {
      if (typeof pwa?.[key] !== "string" || !HEX_COLOR.test(pwa[key] as string)) add(`manifest の pwa.${key} は #RRGGBB の形にしてください`);
    }
    const icon = typeof pwa?.icon === "string" ? (pwa.icon as string) : "";
    const iconPath = path.resolve(appDir, "assets", icon);
    if (!icon || !iconPath.startsWith(path.join(appDir, "assets") + path.sep) || !existsSync(iconPath)) {
      add("manifest の pwa.icon には、assets/ の中の PNG のパスを書いてください（例: \"icon-512.png\"）");
    } else {
      const size = pngSize(iconPath);
      if (!size) add("pwa.icon は PNG にしてください");
      else if (size.width !== 512 || size.height !== 512) add(`pwa.icon は 512×512 の PNG にしてください（今は ${size.width}×${size.height}）`);
    }
  }
  if (manifest.storage !== undefined) {
    const max = (manifest.storage as Record<string, unknown>)?.maxDocs;
    if (max !== undefined && !(typeof max === "number" && Number.isInteger(max) && max >= 1 && max <= APP_DOCUMENTS_MAX_LIMIT)) {
      add(`manifest の storage.maxDocs は 1〜${APP_DOCUMENTS_MAX_LIMIT} にしてください`);
    }
  }
  const ai = manifest.ai as Record<string, unknown> | undefined;
  if (ai !== undefined) {
    if (typeof ai?.purpose !== "string" || !ai.purpose.trim()) add("manifest の ai.purpose（何のために AI に送るか）を書いてください");
    if (!Array.isArray(ai?.sends) || ai.sends.length === 0 || ai.sends.some((x) => typeof x !== "string" || !x.trim())) {
      add("manifest の ai.sends（AI に送るもの。例: [\"日記の文字\"]）を書いてください");
    }
    if (ai?.model !== undefined && !(APP_AI_MODELS as readonly string[]).includes(ai.model as string)) {
      add(`manifest の ai.model は ${APP_AI_MODELS.join(" / ")} のどれかにしてください`);
    }
    const dl = ai?.dailyLimit;
    if (dl !== undefined && !(typeof dl === "number" && Number.isInteger(dl) && dl >= 1 && dl <= APP_AI_LIMITS.maxDailyLimit)) {
      add(`manifest の ai.dailyLimit は 1〜${APP_AI_LIMITS.maxDailyLimit} にしてください`);
    }
  }
  return { problems, sharing: manifest.sharing === true, ai: ai !== undefined };
}

/** ai.ts（AI の仕事の宣言）を読み込んで確かめる */
export async function checkAiTasks(appDir: string, app: string, declared: boolean): Promise<Problem[]> {
  const problems: Problem[] = [];
  const add = (message: string) => problems.push({ app, file: "ai.ts", message });
  const file = path.join(appDir, "ai.ts");
  if (!existsSync(file)) {
    if (declared) add("manifest に ai を書いたときは、ai.ts に AI の仕事を書いてください（export const ai = defineAppAI({...})）");
    return problems;
  }
  if (!declared) add("ai.ts を使うときは、manifest に ai（purpose と sends）を書いてください");
  let tasks: unknown;
  try {
    tasks = (await import(pathToFileURL(file).href)).ai;
  } catch (e) {
    add(`ai.ts を読み込めません: ${(e as Error).message}`);
    return problems;
  }
  if (!tasks || typeof tasks !== "object" || Object.keys(tasks).length === 0) {
    add("ai.ts で、AI の仕事を 1 つ以上 export してください（export const ai = defineAppAI({...})）");
    return problems;
  }
  for (const [name, task] of Object.entries(tasks)) for (const m of taskProblems(name, task)) add(m);
  return problems;
}

type RegistryEntry = { id: string; hasAdmin: boolean; hasAi: boolean };

export function renderRegistry(apps: RegistryEntry[]): { registry: string; views: string } {
  const head = "// このファイルは npm run apps:gen が生成する。手で書き換えない（scripts/apps.ts）\n";
  const registry = [
    head,
    `import type { AppDefinition } from "./types";`,
    ...apps.flatMap((a, i) => [
      `import { manifest as manifest${i} } from "../../apps/${a.id}/manifest";`,
      ...(a.hasAi ? [`import { ai as ai${i} } from "../../apps/${a.id}/ai";`] : []),
    ]),
    "",
    "/** お寺のアプリの manifest と AI の仕事（ドメイン層が使う） */",
    "export const APP_DEFINITIONS: AppDefinition[] = [",
    ...apps.map((a, i) => `  { manifest: manifest${i}${a.hasAi ? `, ai: ai${i}` : ""} },`),
    "];",
    "",
  ].join("\n");
  const views = [
    head,
    `import type { AppViews } from "./types";`,
    ...apps.flatMap((a, i) => [
      `import App${i} from "../../apps/${a.id}/App";`,
      ...(a.hasAdmin ? [`import Admin${i} from "../../apps/${a.id}/Admin";`] : []),
    ]),
    "",
    "/** お寺のアプリの画面（利用者の画面と管理画面が使う） */",
    "export const APP_VIEWS: Record<string, AppViews> = {",
    ...apps.map((a, i) => `  ${JSON.stringify(a.id)}: { App: App${i}${a.hasAdmin ? `, Admin: Admin${i}` : ""} },`),
    "};",
    "",
  ].join("\n");
  return { registry, views };
}

function registryEntries(root: string): RegistryEntry[] {
  return listPublishedApps(root).map((id) => {
    const dir = path.join(root, APPS_DIR, id);
    return { id, hasAdmin: existsSync(path.join(dir, "Admin.tsx")), hasAi: existsSync(path.join(dir, "ai.ts")) };
  });
}

/** 一覧を作り直し、素材を public/app-assets/<app-id>/ に写す（本体だけ） */
export function generate(root = ROOT): void {
  const { registry, views } = renderRegistry(registryEntries(root));
  writeFileSync(path.join(root, REGISTRY_FILE), registry);
  writeFileSync(path.join(root, VIEWS_FILE), views);
  const out = path.join(root, PUBLIC_ASSETS_DIR);
  rmSync(out, { recursive: true, force: true });
  for (const id of listPublishedApps(root)) {
    const src = path.join(root, APPS_DIR, id, "assets");
    if (!existsSync(src)) continue;
    mkdirSync(out, { recursive: true });
    cpSync(src, path.join(out, id), {
      recursive: true,
      filter: (p) => statSync(p).isDirectory() || (APP_ASSET_EXTENSIONS as readonly string[]).includes(path.extname(p).slice(1).toLowerCase()),
    });
  }
}

/**
 * 規約のチェック。registry: false にすると、一覧が最新かは確かめない（開発キットでは一覧を作らないため）。
 */
export async function check(root = ROOT, opts: { registry?: boolean } = {}): Promise<Problem[]> {
  const problems: Problem[] = [];
  for (const app of listAppDirs(root)) {
    const dir = path.join(root, APPS_DIR, app);
    if (!app.startsWith("_") && !APP_ID.test(app)) problems.push({ app, message: "ディレクトリの名前は英小文字・数字・- にしてください" });
    if (RESERVED_IDS.has(app)) problems.push({ app, message: `「${app}」は本体が使う名前なので、アプリの ID にできません` });
    for (const f of REQUIRED_FILES) {
      if (!existsSync(path.join(dir, f))) problems.push({ app, file: f, message: "必要なファイルがありません" });
    }
    problems.push(...checkAppSources(dir, app));
    problems.push(...checkAssets(dir, app));
    if (existsSync(path.join(dir, "manifest.ts"))) {
      const m = await checkManifest(dir, app);
      problems.push(...m.problems);
      problems.push(...checkCapabilityUsage(dir, app, m));
      problems.push(...(await checkAiTasks(dir, app, m.ai)));
      if (m.sharing && !existsSync(path.join(dir, "Admin.tsx"))) {
        problems.push({ app, file: "Admin.tsx", message: "sharing: true のアプリには、スタッフの画面（Admin.tsx）が必要です" });
      }
    }
  }
  if (opts.registry === false) return problems;
  const { registry, views } = renderRegistry(registryEntries(root));
  const read = (f: string) => (existsSync(path.join(root, f)) ? readFileSync(path.join(root, f), "utf8") : "");
  if (read(REGISTRY_FILE) !== registry || read(VIEWS_FILE) !== views) {
    problems.push({ app: "(一覧)", message: "アプリの一覧が古くなっています。npm run apps:gen を流してください" });
  }
  return problems;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "gen") {
    generate();
    console.log(`お寺のアプリの一覧を作りました: ${listPublishedApps().join(", ") || "（なし）"}`);
    return;
  }
  if (cmd === "check") {
    const problems = await check();
    if (problems.length === 0) {
      console.log(`規約違反はありません（${listAppDirs().join(", ") || "アプリなし"}）`);
      return;
    }
    for (const p of problems) console.error(`✗ apps/${p.app}${p.file ? `/${p.file}` : ""}: ${p.message}`);
    console.error(`\n${problems.length} 件の規約違反があります（apps/CLAUDE.md を参照）`);
    process.exit(1);
  }
  console.error("使い方: tsx scripts/apps.ts gen | check");
  process.exit(2);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
