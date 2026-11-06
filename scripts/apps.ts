// お寺のアプリ（apps/<app-id>/）の一覧の生成と、規約のチェック。spec.md §7、apps/CLAUDE.md
//   npm run apps:gen    一覧（src/apps-sdk/registry.generated.ts と views.generated.ts）を作り直す
//   npm run apps:check  規約違反を探す（公開の前に必ず流す）。一覧が古い場合も知らせる
// ※ 正規表現のチェックなので、うっかりした違反は見つけられるが、悪意のある書き方までは防げない（公開の前に人がコードを読む）
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..");
const APPS_DIR = "apps";
const REGISTRY_FILE = "src/apps-sdk/registry.generated.ts";
const VIEWS_FILE = "src/apps-sdk/views.generated.ts";

export const REQUIRED_FILES = ["manifest.ts", "App.tsx", "README.md"];
const APP_ID = /^[a-z0-9][a-z0-9-]*$/;
/** URL（/apps/<app-id>）で本体が使う名前 */
const RESERVED_IDS = new Set(["api"]);
const ALLOWED_IMPORTS = new Set(["react", "zod", "@/apps-sdk"]);

/** 外部への送信、データや環境への直接のアクセス、危険な書き方 */
const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bfetch\s*\(/, reason: "fetch を使わない（データは useAppStorage で読み書きする。外部に送信しない）" },
  { pattern: /\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b/, reason: "外部に送信しない" },
  { pattern: /https?:\/\//, reason: "外部の URL を使わない（画像やリンクも、読み込むだけで外部に伝わる）" },
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

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

/** コメント（/* *\/ と、行頭の //）を除く */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function importsOf(src: string): string[] {
  const out: string[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
  for (let m = re.exec(src); m; m = re.exec(src)) out.push(m[1]);
  return out;
}

/** ソースの規約（import、禁止の書き方） */
export function checkAppSources(appDir: string, app: string): Problem[] {
  const problems: Problem[] = [];
  for (const file of sourceFiles(appDir)) {
    const rel = path.relative(appDir, file);
    const src = stripComments(readFileSync(file, "utf8"));
    for (const spec of importsOf(src)) {
      if (spec.startsWith(".")) {
        const resolved = path.resolve(path.dirname(file), spec);
        if (resolved !== appDir && !resolved.startsWith(appDir + path.sep)) {
          problems.push({ app, file: rel, message: `アプリのディレクトリの外を import しない: ${spec}` });
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

/** sharing: false のアプリが、お寺との共有の操作を使っていないか */
export function checkSharingUsage(appDir: string, app: string, sharing: boolean): Problem[] {
  if (sharing) return [];
  return sourceFiles(appDir)
    .filter((f) => /\buseAppSharing\b/.test(stripComments(readFileSync(f, "utf8"))))
    .map((f) => ({ app, file: path.relative(appDir, f), message: "useAppSharing を使うときは、manifest の sharing を true にしてください" }));
}

/** manifest の中身（読み込んで確かめる） */
export async function checkManifest(appDir: string, app: string): Promise<{ problems: Problem[]; sharing: boolean }> {
  const problems: Problem[] = [];
  const add = (message: string) => problems.push({ app, file: "manifest.ts", message });
  let manifest: Record<string, unknown> | undefined;
  try {
    manifest = (await import(path.join(appDir, "manifest.ts"))).manifest;
  } catch (e) {
    add(`manifest.ts を読み込めません: ${(e as Error).message}`);
    return { problems, sharing: false };
  }
  if (!manifest || typeof manifest !== "object") {
    add("manifest を export してください（export const manifest = defineAppManifest({...})）");
    return { problems, sharing: false };
  }
  if (!app.startsWith("_") && manifest.id !== app) add(`manifest の id（${String(manifest.id)}）をディレクトリの名前（${app}）と同じにしてください`);
  for (const key of ["name", "description", "icon"]) {
    if (typeof manifest[key] !== "string" || !(manifest[key] as string).trim()) add(`manifest の ${key} を書いてください`);
  }
  if (typeof manifest.sharing !== "boolean") add("manifest の sharing を true か false にしてください");
  return { problems, sharing: manifest.sharing === true };
}

export function renderRegistry(apps: { id: string; hasAdmin: boolean }[]): { registry: string; views: string } {
  const head = "// このファイルは npm run apps:gen が生成する。手で書き換えない（scripts/apps.ts）\n";
  const registry = [
    head,
    `import type { AppDefinition } from "./types";`,
    ...apps.map((a, i) => `import { manifest as manifest${i} } from "../../apps/${a.id}/manifest";`),
    "",
    "/** お寺のアプリの manifest（ドメイン層が使う） */",
    "export const APP_DEFINITIONS: AppDefinition[] = [",
    ...apps.map((_, i) => `  { manifest: manifest${i} },`),
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

function publishedWithViews(root: string) {
  return listPublishedApps(root).map((id) => ({ id, hasAdmin: existsSync(path.join(root, APPS_DIR, id, "Admin.tsx")) }));
}

export function generate(root = ROOT): void {
  const { registry, views } = renderRegistry(publishedWithViews(root));
  writeFileSync(path.join(root, REGISTRY_FILE), registry);
  writeFileSync(path.join(root, VIEWS_FILE), views);
}

/**
 * 規約のチェック。registry: false にすると、一覧が最新かは確かめない（開発キットでは一覧を作らないため）。
 * このファイルは、開発キット（kit/）にもそのままコピーされる（npm run kit:build）
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
    if (existsSync(path.join(dir, "manifest.ts"))) {
      const m = await checkManifest(dir, app);
      problems.push(...m.problems);
      problems.push(...checkSharingUsage(dir, app, m.sharing));
      if (m.sharing && !existsSync(path.join(dir, "Admin.tsx"))) {
        problems.push({ app, file: "Admin.tsx", message: "sharing: true のアプリには、スタッフの画面（Admin.tsx）が必要です" });
      }
    }
  }
  if (opts.registry === false) return problems;
  const { registry, views } = renderRegistry(publishedWithViews(root));
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
