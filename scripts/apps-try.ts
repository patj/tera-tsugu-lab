// 本体の外（開発キットなど）で作っているお寺のアプリを、本体の apps/<app-id>/ にコピーして試す。docs/team-setup.md
//   npm run apps:try -- <アプリのフォルダー>   コピーして、一覧を作り直し、決まりのチェックを流す
//   npm run apps:untry -- <app-id>            apps:try で置いたコピーを消す
// - 元のファイルは本体の外にあり、コピーは一方向（本体の側で直さない。直したら、もう一度 apps:try する）
// - コピーは .git/info/exclude（手元だけの無視の設定。コミットされない）に載せて、git に無視させる。載っているものだけを、apps:try が上書きし、apps:untry が消す
// - リポジトリに入っているアプリと、apps:try で置いたのではないフォルダーには触れない
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { check, generate, ROOT } from "./apps";

/** scripts/apps.ts の APP_ID と同じ（_ で始まるひな形は試さない） */
const APP_ID = /^[a-z0-9][a-z0-9-]*$/;
/** コピーしないもの（API キー、依存、OS のごみ） */
const SKIP = /^(\.env(\..*)?|node_modules|\.DS_Store|Thumbs\.db)$/;

function git(root: string, args: string[]): string {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (r.error) throw new Error(`git を実行できません: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} に失敗しました: ${r.stderr.trim()}`);
  return r.stdout;
}

function excludeFile(root: string): string {
  return path.resolve(root, git(root, ["rev-parse", "--git-path", "info/exclude"]).trim());
}

function excludeLine(id: string): string {
  return `/apps/${id}/`;
}

function readExclude(root: string): string[] {
  const f = excludeFile(root);
  return existsSync(f) ? readFileSync(f, "utf8").split(/\r?\n/) : [];
}

function isTried(root: string, id: string): boolean {
  return readExclude(root).includes(excludeLine(id));
}

function isTracked(root: string, id: string): boolean {
  return git(root, ["ls-files", "--", `apps/${id}`]).trim() !== "";
}

/** ~ で始まるパスをホームフォルダーにする（PowerShell は外部のコマンドに ~ を渡すため） */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  return p.startsWith("~/") || p.startsWith("~\\") ? path.join(homedir(), p.slice(2)) : p;
}

/** アプリのフォルダーを apps/<app-id>/ にコピーし、git に無視させる。app-id を返す */
export function placeApp(source: string, root = ROOT): string {
  const src = path.resolve(expandHome(source));
  if (!existsSync(src) || !statSync(src).isDirectory()) throw new Error(`フォルダーがありません: ${src}`);
  if (!existsSync(path.join(src, "manifest.ts"))) throw new Error(`お寺のアプリのフォルダーではありません（manifest.ts がありません）: ${src}`);
  const id = path.basename(src);
  if (!APP_ID.test(id)) throw new Error(`フォルダーの名前（アプリの ID）は英小文字・数字・- にしてください: ${id}`);
  const dest = path.join(root, "apps", id);
  if (path.relative(dest, src) === "") throw new Error("本体の apps/ の中のアプリは、apps:try で試せません（すでに本体にあります）");
  if (isTracked(root, id)) {
    throw new Error(`apps/${id} は本体に組み込まれているアプリなので、上書きしません。新しい版を試すときは、開発者に相談してください`);
  }
  if (existsSync(dest) && !isTried(root, id)) {
    throw new Error(`apps/${id} は apps:try で置いたものではないので、上書きしません`);
  }
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true, filter: (p) => !SKIP.test(path.basename(p)) });
  if (!isTried(root, id)) {
    const f = excludeFile(root);
    mkdirSync(path.dirname(f), { recursive: true });
    const before = existsSync(f) ? readFileSync(f, "utf8") : "";
    const sep = before === "" || before.endsWith("\n") ? "" : "\n";
    writeFileSync(f, `${before}${sep}# npm run apps:try で置いたお寺のアプリ（npm run apps:untry で消す）\n${excludeLine(id)}\n`);
  }
  return id;
}

/** apps:try で置いたコピーを消し、無視の設定から外す */
export function removeTriedApp(id: string, root = ROOT): void {
  if (!APP_ID.test(id)) throw new Error(`アプリの ID は英小文字・数字・- です: ${id}`);
  if (!isTried(root, id)) throw new Error(`apps/${id} は apps:try で置いたものではないので、消しません`);
  if (isTracked(root, id)) throw new Error(`apps/${id} は本体に組み込まれているので、消しません`);
  rmSync(path.join(root, "apps", id), { recursive: true, force: true });
  const lines = readExclude(root);
  const i = lines.indexOf(excludeLine(id));
  const drop = new Set([i]);
  if (i > 0 && lines[i - 1].includes("apps:try")) drop.add(i - 1);
  writeFileSync(excludeFile(root), lines.filter((_, n) => !drop.has(n)).join("\n"));
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!arg || (cmd !== "try" && cmd !== "untry")) {
    console.error("使い方: npm run apps:try -- <アプリのフォルダー>  /  npm run apps:untry -- <app-id>");
    process.exit(2);
  }
  if (cmd === "untry") {
    removeTriedApp(arg);
    generate();
    console.log(`apps/${arg} を消しました`);
    return;
  }
  const id = placeApp(arg);
  generate();
  console.log(`apps/${id} にコピーしました（git には無視させています。ここでは直さず、元のフォルダーで直して、もう一度 apps:try してください）`);
  const problems = await check();
  if (problems.length > 0) {
    for (const p of problems) console.error(`✗ apps/${p.app}${p.file ? `/${p.file}` : ""}: ${p.message}`);
    console.error(`\n${problems.length} 件の規約違反があります（apps/CLAUDE.md を参照）。元のフォルダーで直してください`);
    process.exit(1);
  }
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  console.log(`規約違反はありません。npm run dev を起動して、${base}/apps/${id} で確かめてください`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
