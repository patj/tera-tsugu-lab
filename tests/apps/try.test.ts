// npm run apps:try / apps:untry（本体の外で作っているお寺のアプリを、本体にコピーして試す）
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { expandHome, placeApp, removeTriedApp } from "../../scripts/apps-try";

let work: string;
let root: string;
let src: string;

function git(...args: string[]) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

function writeApp(dir: string, body: string) {
  mkdirSync(path.join(dir, "assets"), { recursive: true });
  writeFileSync(path.join(dir, "manifest.ts"), "export const manifest = {};\n");
  writeFileSync(path.join(dir, "App.tsx"), body);
  writeFileSync(path.join(dir, "assets/a.png"), "png");
  writeFileSync(path.join(dir, ".env"), "ANTHROPIC_API_KEY=secret\n");
  mkdirSync(path.join(dir, "node_modules/x"), { recursive: true });
}

describe("apps:try", () => {
  before(() => {
    work = mkdtempSync(path.join(tmpdir(), "apps-try-"));
    root = path.join(work, "host");
    mkdirSync(path.join(root, "apps"), { recursive: true });
    git("init", "-q");
    src = path.join(work, "kit/apps/my-app");
    writeApp(src, "// v1\n");
  });
  after(() => rmSync(work, { recursive: true, force: true }));

  it("apps/<app-id>/ にコピーし、git に無視させる。.env と node_modules はコピーしない", () => {
    assert.equal(placeApp(src, root), "my-app");
    const dest = path.join(root, "apps/my-app");
    assert.equal(readFileSync(path.join(dest, "App.tsx"), "utf8"), "// v1\n");
    assert.ok(existsSync(path.join(dest, "assets/a.png")));
    assert.ok(!existsSync(path.join(dest, ".env")), "API キーをコピーしない");
    assert.ok(!existsSync(path.join(dest, "node_modules")));
    assert.equal(git("status", "--porcelain").trim(), "", "git の変更に出ない");
  });

  it("もう一度 apps:try すると、新しい版で置き換える（消したファイルも消える）", () => {
    writeFileSync(path.join(src, "App.tsx"), "// v2\n");
    rmSync(path.join(src, "assets/a.png"));
    placeApp(src, root);
    const dest = path.join(root, "apps/my-app");
    assert.equal(readFileSync(path.join(dest, "App.tsx"), "utf8"), "// v2\n");
    assert.ok(!existsSync(path.join(dest, "assets/a.png")));
    const exclude = readFileSync(path.join(root, ".git/info/exclude"), "utf8");
    assert.equal(exclude.split("\n").filter((l) => l === "/apps/my-app/").length, 1, "無視の設定は 1 行だけ");
  });

  it("apps:untry で、コピーと無視の設定を消す", () => {
    removeTriedApp("my-app", root);
    assert.ok(!existsSync(path.join(root, "apps/my-app")));
    assert.ok(!readFileSync(path.join(root, ".git/info/exclude"), "utf8").includes("/apps/my-app/"));
    assert.throws(() => removeTriedApp("my-app", root), /apps:try で置いたものではない/);
  });

  it("本体に組み込まれているアプリと、apps:try で置いたのではないフォルダーは上書きしない", () => {
    const committed = path.join(root, "apps/committed-app");
    writeApp(committed, "// committed\n");
    git("add", "apps/committed-app/App.tsx");
    const other = path.join(work, "kit2/apps/committed-app");
    writeApp(other, "// other\n");
    assert.throws(() => placeApp(other, root), /本体に組み込まれている/);
    assert.equal(readFileSync(path.join(committed, "App.tsx"), "utf8"), "// committed\n");

    const handmade = path.join(root, "apps/handmade");
    writeApp(handmade, "// handmade\n");
    const other2 = path.join(work, "kit3/apps/handmade");
    writeApp(other2, "// other\n");
    assert.throws(() => placeApp(other2, root), /apps:try で置いたものではない/);
    assert.equal(readFileSync(path.join(handmade, "App.tsx"), "utf8"), "// handmade\n");
    assert.throws(() => removeTriedApp("handmade", root), /apps:try で置いたものではない/);
  });

  it("お寺のアプリでないフォルダー、ID にできない名前は断る", () => {
    const notApp = path.join(work, "not-app");
    mkdirSync(notApp, { recursive: true });
    assert.throws(() => placeApp(notApp, root), /manifest\.ts がありません/);
    const bad = path.join(work, "Bad_App");
    writeApp(bad, "// x\n");
    assert.throws(() => placeApp(bad, root), /英小文字/);
  });

  it("~ をホームフォルダーにする", () => {
    assert.equal(expandHome("~/a/b"), path.join(homedir(), "a/b"));
    assert.equal(expandHome("~\\a"), path.join(homedir(), "a"));
    assert.equal(expandHome("/x/~/y"), "/x/~/y");
  });
});
