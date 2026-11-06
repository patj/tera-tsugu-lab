// 開発キット（kit/、npm run kit:build）が本体とそろっているか。spec.md §7「開発キット」
// 本体の SDK を変えたら、キットの sdk/storage.tsx もそろえる（このテストが落ちて知らせる）
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { buildKit } from "../../scripts/build-kit";
import { check, ROOT } from "../../scripts/apps";

const OUT = path.join(ROOT, "dist/kit-test");
/** キットの中に置いた、API キーのふりのファイル（zip に入らないことを確かめる。本物の .env は上書きしない） */
const FAKE_ENV = path.join(ROOT, "kit/.env.kit-test");

describe("開発キット", () => {
  before(() => {
    writeFileSync(FAKE_ENV, "ANTHROPIC_API_KEY=should-not-be-copied\n");
    buildKit(OUT);
  });
  after(() => {
    rmSync(FAKE_ENV, { force: true });
    rmSync(OUT, { recursive: true, force: true });
  });

  it("本体と同じものをコピーする（型、決まりのチェック、ひな形、決まり）", () => {
    for (const [host, kit] of [
      ["src/apps-sdk/types.ts", "sdk/types.ts"],
      ["src/apps-sdk/ai-schema.ts", "sdk/ai-schema.ts"],
      ["src/apps-sdk/ai-server.ts", "sdk/ai-server.ts"],
      ["src/apps-sdk/ai-client.tsx", "sdk/ai-client.tsx"],
      ["src/apps-sdk/assets.tsx", "sdk/assets.tsx"],
      ["src/apps-sdk/image.ts", "sdk/image.ts"],
      ["scripts/apps.ts", "scripts/apps.ts"],
      ["apps/CLAUDE.md", "apps/CLAUDE.md"],
      ["apps/_template/App.tsx", "apps/_template/App.tsx"],
    ]) {
      assert.equal(readFileSync(path.join(OUT, kit), "utf8"), readFileSync(path.join(ROOT, host), "utf8"), kit);
    }
    for (const f of ["README.md", "CLAUDE.md", "package.json", ".env.example", ".claude/skills/new-temple-app/SKILL.md", "preview/Preview.tsx", "preview/ai-middleware.ts"]) {
      assert.ok(existsSync(path.join(OUT, f)), f);
    }
    assert.ok(!existsSync(path.join(OUT, "node_modules")));
    assert.ok(!existsSync(path.join(OUT, ".env.kit-test")), "API キーのファイルを入れない");
    assert.ok(!existsSync(path.join(OUT, ".env")), "API キーのファイルを入れない");
  });

  it("キットの SDK は、本体の SDK と同じ名前を export する", async () => {
    const host = await import(path.join(ROOT, "src/apps-sdk/index.ts"));
    const kit = await import(path.join(OUT, "sdk/index.ts"));
    assert.deepEqual(Object.keys(kit).sort(), Object.keys(host).sort());
  });

  it("キットの中のひな形は、決まりのチェックを通る", async () => {
    assert.deepEqual(await check(OUT, { registry: false }), []);
  });
});
