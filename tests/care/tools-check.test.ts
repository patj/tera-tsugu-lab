// ケアのツールの規約のチェック（npm run tools:check）と一覧の生成
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { check, checkManifest, checkToolSources, renderRegistry, ROOT } from "../../scripts/care-tools";

describe("tools:check", () => {
  it("リポジトリのツール（ひな形を含む）に規約違反がなく、一覧が最新", async () => {
    assert.deepEqual(await check(ROOT), []);
  });

  it("ひな形の manifest と schema は正しい", async () => {
    assert.deepEqual(await checkManifest(path.join(ROOT, "tools/_template"), "_template"), []);
  });

  it("DB への直接のアクセス、外部への送信、診断的な表現、ディレクトリの外の import を見つける", () => {
    const root = mkdtempSync(path.join(tmpdir(), "care-tools-"));
    try {
      const dir = path.join(root, "bad-tool");
      mkdirSync(dir);
      writeFileSync(
        path.join(dir, "Entry.tsx"),
        [
          `import { db } from "@/db/client";`,
          `import { secret } from "../other/secret";`,
          `import pg from "pg";`,
          `export default function Entry() {`,
          `  fetch("https://example.com/collect", { method: "POST" });`,
          `  localStorage.setItem("x", "y");`,
          `  return <p>あなたはうつ病の可能性があります {process.env.SECRET}</p>;`,
          `}`,
        ].join("\n"),
      );
      const messages = checkToolSources(dir, "bad-tool").map((p) => p.message);
      const has = (re: RegExp) => assert.ok(messages.some((m) => re.test(m)), `${re} が見つからない: ${messages.join(" / ")}`);
      has(/@\/db\/client/);
      has(/ディレクトリの外/);
      has(/: pg$/);
      has(/fetch/);
      has(/外部の URL/);
      has(/端末に記録を保存しない/);
      has(/うつ病/);
      has(/環境変数/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("コメントの中の言葉は問題にしない", () => {
    const root = mkdtempSync(path.join(tmpdir(), "care-tools-"));
    try {
      const dir = path.join(root, "ok-tool");
      mkdirSync(dir);
      writeFileSync(path.join(dir, "Entry.tsx"), `// 診断はしない。fetch( も使わない\nexport default function Entry() { return null; }\n`);
      assert.deepEqual(checkToolSources(dir, "ok-tool"), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("一覧には _ で始まるディレクトリ（ひな形）を載せない形で、静的な import を並べる", () => {
    const { registry, views } = renderRegistry(["a-tool", "b-tool"]);
    assert.match(registry, /tools\/a-tool\/manifest/);
    assert.match(views, /"b-tool": \{ Entry: Entry1, History: History1, AdminView: AdminView1 \}/);
  });
});
