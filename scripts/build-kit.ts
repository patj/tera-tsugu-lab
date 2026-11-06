// npm run kit:build: お寺に渡す開発キット（dist/temple-app-kit.zip）を作る。spec.md §7「開発キット」
// kit/ の中身に、本体と同じでなければならないものを本体からコピーして足す（ずれないように、手でコピーしない）
//   src/apps-sdk/{types,ai-schema,ai-server,ai-client,assets,image} → sdk/（API の型、AI、素材。本体と同じ処理）
//   scripts/apps.ts       → scripts/apps.ts（決まりのチェック）
//   apps/_template/       → apps/_template/（ひな形）
//   apps/CLAUDE.md        → apps/CLAUDE.md（決まり）
// npm run kit:build -- --into <フォルダー>: キットをそのフォルダーに作る。すでにあるキットなら新しくする
//   （作っているアプリ apps/<app-id>/、.env、node_modules は残す）。zip は作らない
// zip は zip のコマンドで作る。ない環境（Windows など）では、フォルダーだけを作る
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { expandHome } from "./apps-try";

const ROOT = path.resolve(__dirname, "..");

export function buildKit(outDir = path.join(ROOT, "dist/temple-app-kit")): string {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(path.join(ROOT, "kit"), outDir, {
    recursive: true,
    // node_modules、dist、.env（API キー）は入れない
    filter: (src) => {
      const rel = path.relative(ROOT, src);
      if (/[/\\](node_modules|dist)([/\\]|$)/.test(rel)) return false;
      const base = path.basename(src);
      return !(base === ".env" || (base.startsWith(".env.") && base !== ".env.example"));
    },
  });
  const copies: [string, string][] = [
    ["src/apps-sdk/types.ts", "sdk/types.ts"],
    ["src/apps-sdk/ai-schema.ts", "sdk/ai-schema.ts"],
    ["src/apps-sdk/ai-server.ts", "sdk/ai-server.ts"],
    ["src/apps-sdk/ai-client.tsx", "sdk/ai-client.tsx"],
    ["src/apps-sdk/assets.tsx", "sdk/assets.tsx"],
    ["src/apps-sdk/image.ts", "sdk/image.ts"],
    ["scripts/apps.ts", "scripts/apps.ts"],
    ["apps/_template", "apps/_template"],
    ["apps/CLAUDE.md", "apps/CLAUDE.md"],
  ];
  for (const [from, to] of copies) {
    mkdirSync(path.dirname(path.join(outDir, to)), { recursive: true });
    cpSync(path.join(ROOT, from), path.join(outDir, to), { recursive: true });
  }
  return outDir;
}

/** zip を作る。zip のコマンドがなければ null */
export function zipKit(dir: string): string | null {
  const zip = `${dir}.zip`;
  if (existsSync(zip)) rmSync(zip);
  try {
    execFileSync("zip", ["-rqX", path.basename(zip), path.basename(dir), "-x", "*/.DS_Store"], { cwd: path.dirname(dir) });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  return zip;
}

/** 新しくするときに残すもの（キットの直下と apps/ の中） */
const KEEP_TOP = new Set(["apps", ".env", "node_modules"]);
const KIT_OWNED_IN_APPS = new Set(["_template", "CLAUDE.md"]);

function isKit(dir: string): boolean {
  try {
    return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).name === "temple-app-kit";
  } catch {
    return false;
  }
}

/**
 * キットを target に作る。target がキットなら、作っているアプリ（apps/<app-id>/）、.env、node_modules を残して、ほかを新しくする。
 * target がキットでないフォルダーで、空でなければ、何もしない（ほかのファイルを消さないため）
 */
export function installKit(target: string, built = buildKit()): "created" | "updated" {
  const dest = path.resolve(target);
  const exists = existsSync(dest) && readdirSync(dest).length > 0;
  if (exists && !isKit(dest)) throw new Error(`${dest} は開発キットのフォルダーではないので、書き込みません（空のフォルダーか、キットのフォルダーを指定してください）`);
  if (exists) {
    for (const name of readdirSync(dest)) {
      if (!KEEP_TOP.has(name)) rmSync(path.join(dest, name), { recursive: true, force: true });
    }
    for (const name of KIT_OWNED_IN_APPS) rmSync(path.join(dest, "apps", name), { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });
  cpSync(built, dest, { recursive: true });
  return exists ? "updated" : "created";
}

if (require.main === module) {
  const i = process.argv.indexOf("--into");
  if (i >= 0) {
    const raw = process.argv[i + 1];
    if (!raw) {
      console.error("使い方: npm run kit:build -- --into <フォルダー>");
      process.exit(2);
    }
    const target = expandHome(raw);
    try {
      const r = installKit(target);
      console.log(`開発キットを${r === "created" ? "作りました" : "新しくしました（apps/ のアプリ、.env、node_modules は残しています）"}: ${path.resolve(target)}`);
      console.log("キットのフォルダーで npm install を実行してください");
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  } else {
    const dir = buildKit();
    const zip = zipKit(dir);
    console.log(
      zip
        ? `開発キットを作りました: ${path.relative(ROOT, zip)}（中身: ${path.relative(ROOT, dir)}/）`
        : `開発キットを作りました: ${path.relative(ROOT, dir)}/（zip のコマンドがないので、zip は作っていません）`,
    );
  }
}
