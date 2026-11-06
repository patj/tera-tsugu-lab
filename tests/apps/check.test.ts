// お寺のアプリの規約のチェック（npm run apps:check）と一覧の生成
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { check, checkAppSources, checkManifest, renderRegistry, ROOT } from "../../scripts/apps";

function withTempApp(files: Record<string, string>, fn: (dir: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), "temple-apps-"));
  try {
    const dir = path.join(root, "x-app");
    mkdirSync(dir);
    for (const [name, src] of Object.entries(files)) writeFileSync(path.join(dir, name), src);
    fn(dir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("apps:check", () => {
  it("リポジトリのアプリ（ひな形を含む）に規約違反がなく、一覧が最新", async () => {
    assert.deepEqual(await check(ROOT), []);
  });

  it("ひな形の manifest は正しく、共有を使う", async () => {
    const r = await checkManifest(path.join(ROOT, "apps/_template"), "_template");
    assert.deepEqual(r, { problems: [], sharing: true });
  });

  it("DB への直接のアクセス、外部への送信、端末への保存、ディレクトリの外の import を見つける", () => {
    withTempApp(
      {
        "App.tsx": [
          `"use client";`,
          `import { db } from "@/db/client";`,
          `import { x } from "../other/secret";`,
          `import { useAppStorage } from "@/apps-sdk";`,
          `export default function App() {`,
          `  fetch("https://example.com/collect", { method: "POST" });`,
          `  localStorage.setItem("k", "v");`,
          `  return <p>{process.env.SECRET}</p>;`,
          `}`,
        ].join("\n"),
      },
      (dir) => {
        const messages = checkAppSources(dir, "x-app").map((p) => p.message);
        const has = (re: RegExp) => assert.ok(messages.some((m) => re.test(m)), `${re}: ${messages.join(" / ")}`);
        has(/@\/db\/client/);
        has(/ディレクトリの外/);
        has(/fetch/);
        has(/外部の URL/);
        has(/端末にデータを保存しない/);
        has(/環境変数/);
        assert.ok(!messages.some((m) => m.endsWith(": @/apps-sdk")), "@/apps-sdk は許可する");
      },
    );
  });

  it("コメントの中の言葉は問題にしない", () => {
    withTempApp({ "App.tsx": `// fetch( は使わない\nexport default function App() { return null; }\n` }, (dir) => {
      assert.deepEqual(checkAppSources(dir, "x-app"), []);
    });
  });

  it("一覧は静的な import を並べ、Admin.tsx があるアプリだけ Admin を載せる", () => {
    const { registry, views } = renderRegistry([
      { id: "a-app", hasAdmin: true },
      { id: "b-app", hasAdmin: false },
    ]);
    assert.match(registry, /apps\/a-app\/manifest/);
    assert.match(views, /"a-app": \{ App: App0, Admin: Admin0 \}/);
    assert.match(views, /"b-app": \{ App: App1 \}/);
  });
});
