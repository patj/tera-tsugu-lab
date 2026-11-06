// npm run kit:build: お寺に渡す開発キット（dist/temple-app-kit.zip）を作る。spec.md §7「開発キット」
// kit/ の中身に、本体と同じでなければならないものを本体からコピーして足す（ずれないように、手でコピーしない）
//   src/apps-sdk/types.ts → sdk/types.ts（API の型）
//   scripts/apps.ts       → scripts/apps.ts（決まりのチェック）
//   apps/_template/       → apps/_template/（ひな形）
//   apps/CLAUDE.md        → apps/CLAUDE.md（決まり）
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

export function buildKit(outDir = path.join(ROOT, "dist/temple-app-kit")): string {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(path.join(ROOT, "kit"), outDir, {
    recursive: true,
    filter: (src) => !/[/\\](node_modules|dist)([/\\]|$)/.test(path.relative(ROOT, src)),
  });
  const copies: [string, string][] = [
    ["src/apps-sdk/types.ts", "sdk/types.ts"],
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

export function zipKit(dir: string): string {
  const zip = `${dir}.zip`;
  if (existsSync(zip)) rmSync(zip);
  execFileSync("zip", ["-rqX", path.basename(zip), path.basename(dir), "-x", "*/.DS_Store"], { cwd: path.dirname(dir) });
  return zip;
}

if (require.main === module) {
  const dir = buildKit();
  const zip = zipKit(dir);
  console.log(`開発キットを作りました: ${path.relative(ROOT, zip)}（中身: ${path.relative(ROOT, dir)}/）`);
}
