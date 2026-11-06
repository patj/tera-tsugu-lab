// お寺のアプリの規約のチェック（npm run apps:check）と一覧の生成
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { check, checkAiTasks, checkAppSources, checkAssets, checkCapabilityUsage, checkManifest, checkSharingUsage, renderRegistry, ROOT } from "../../scripts/apps";

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
    assert.deepEqual(r, { problems: [], sharing: true, perDoc: false, ai: false });
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

  it("sharing: false のアプリで useAppSharing を使うと知らせる", () => {
    withTempApp({ "App.tsx": `import { useAppSharing } from "@/apps-sdk";\nexport default function App() { useAppSharing(); return null; }\n` }, (dir) => {
      assert.equal(checkSharingUsage(dir, "x-app", false).length, 1);
      assert.equal(checkSharingUsage(dir, "x-app", true).length, 0);
    });
  });

  it("1 件ずつの共有: sharing: \"perDoc\" を受け付け、ほかのアプリで setShared や create の shared を使うと知らせる", async () => {
    const app = [
      `"use client";`,
      `import { useAppStorage, useAppSharing } from "@/apps-sdk";`,
      `export default function App() {`,
      `  const { create, setShared } = useAppStorage<{ text: string }>();`,
      `  useAppSharing();`,
      `  return <button onClick={async () => { const d = await create({ text: "x" }, { shared: true }); if (d) await setShared(d.id, false); }}>x</button>;`,
      `}`,
    ].join("\n");
    const manifest = (sharing: string) => `export const manifest = { id: "x-app", name: "x", description: "x", icon: "x", sharing: ${sharing} };\n`;
    for (const [sharing, expected] of [
      [`"perDoc"`, { sharing: true, perDoc: true, usage: 0 }],
      ["true", { sharing: true, perDoc: false, usage: 1 }],
    ] as const) {
      const root = mkdtempSync(path.join(tmpdir(), "temple-apps-"));
      try {
        const dir = path.join(root, "x-app");
        mkdirSync(dir);
        writeFileSync(path.join(dir, "App.tsx"), app);
        writeFileSync(path.join(dir, "manifest.ts"), manifest(sharing));
        const m = await checkManifest(dir, "x-app");
        assert.deepEqual({ problems: m.problems, sharing: m.sharing, perDoc: m.perDoc }, { problems: [], sharing: expected.sharing, perDoc: expected.perDoc });
        const usage = checkCapabilityUsage(dir, "x-app", m);
        assert.equal(usage.length, expected.usage, JSON.stringify(usage));
        if (expected.usage) assert.match(usage[0].message, /"perDoc" にしてください/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
    // 自分の useState の setShared は知らせない
    withTempApp({ "App.tsx": `import { useState } from "react";\nimport { useAppStorage } from "@/apps-sdk";\nexport default function App() { const s = useAppStorage(); const [shared, setShared] = useState(false); setShared(!shared); return null; }\n` }, (dir) => {
      assert.deepEqual(checkCapabilityUsage(dir, "x-app", { sharing: true, ai: false }), []);
    });
  });

  it("sharing の値が正しくないと知らせる。\"perDoc\" でも Admin.tsx が必要", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "temple-apps-"));
    try {
      const dir = path.join(root, "apps", "x-app");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "manifest.ts"), `export const manifest = { id: "x-app", name: "x", description: "x", icon: "x", sharing: "yes" };\n`);
      assert.match((await checkManifest(dir, "x-app")).problems.map((p) => p.message).join(), /sharing を false、true、"perDoc"/);
      // 同じパスの manifest.ts は import の結果が残るので、別のアプリにする
      rmSync(dir, { recursive: true, force: true });
      const y = path.join(root, "apps", "y-app");
      mkdirSync(y, { recursive: true });
      writeFileSync(path.join(y, "manifest.ts"), `export const manifest = { id: "y-app", name: "y", description: "y", icon: "y", sharing: "perDoc" };\n`);
      writeFileSync(path.join(y, "App.tsx"), `export default function App() { return null; }\n`);
      writeFileSync(path.join(y, "README.md"), `# y\n`);
      const problems = await check(root, { registry: false });
      assert.ok(problems.some((p) => p.file === "Admin.tsx" && /"perDoc"/.test(p.message)), JSON.stringify(problems));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("一覧は静的な import を並べ、Admin.tsx があるアプリだけ Admin を載せる", () => {
    const { registry, views } = renderRegistry([
      { id: "a-app", hasAdmin: true, hasAi: true },
      { id: "b-app", hasAdmin: false, hasAi: false },
    ]);
    assert.match(registry, /apps\/a-app\/manifest/);
    assert.match(registry, /import \{ ai as ai0 \} from "\.\.\/\.\.\/apps\/a-app\/ai"/);
    assert.match(registry, /\{ manifest: manifest0, ai: ai0 \}/);
    assert.match(registry, /\{ manifest: manifest1 \}/);
    assert.match(views, /"a-app": \{ App: App0, Admin: Admin0 \}/);
    assert.match(views, /"b-app": \{ App: App1 \}/);
  });

  it("ai.ts は zod と @/apps-sdk だけを import でき、SVG の名前空間の URL は外部の URL にしない", () => {
    withTempApp(
      {
        "ai.ts": `import { z } from "zod";\nimport { x } from "./helper";\nimport { readFileSync } from "node:fs";\n`,
        "Draw.tsx": `const ns = "http://www.w3.org/2000/svg"; const xl = "http://www.w3.org/1999/xlink";\nexport default ns + xl;\n`,
      },
      (dir) => {
        const m = checkAppSources(dir, "x-app").map((p) => `${p.file}: ${p.message}`);
        assert.ok(m.some((x) => x.startsWith("ai.ts") && x.endsWith("./helper")), m.join(" / "));
        assert.ok(m.some((x) => x.startsWith("ai.ts") && x.endsWith("node:fs")), m.join(" / "));
        assert.ok(!m.some((x) => x.startsWith("Draw.tsx")), m.join(" / "));
      },
    );
  });

  it("CSS は *.module.css だけで、:global、@import、外部の URL を使えない", () => {
    withTempApp(
      {
        "global.css": "body{color:red}",
        "App.module.css": ":global(body){color:red}\n@import 'x.css';\n.a{background:url(https://example.com/x.png)}",
        "App.tsx": `import "./global.css";\nimport s from "./App.module.css";\nexport default s;\n`,
      },
      (dir) => {
        const m = checkAppSources(dir, "x-app").map((p) => `${p.file}: ${p.message}`).join(" / ");
        for (const re of [/global\.css: CSS はアプリ専用/, /:global を使わない/, /@import/, /App\.module\.css: 外部の URL/, /App\.tsx: CSS は \*\.module\.css だけ/]) assert.match(m, re);
      },
    );
  });

  it("素材は決まった種類と大きさだけ（SVG は不可）", () => {
    withTempApp({}, (dir) => {
      mkdirSync(path.join(dir, "assets/img"), { recursive: true });
      writeFileSync(path.join(dir, "assets/img/ok.webp"), "x");
      writeFileSync(path.join(dir, "assets/img/bad.svg"), "<svg onload=alert(1)>");
      writeFileSync(path.join(dir, "assets/run.js"), "alert(1)");
      writeFileSync(path.join(dir, "assets/big.png"), Buffer.alloc(2 * 1024 * 1024 + 1));
      const m = checkAssets(dir, "x-app").map((p) => `${p.file}: ${p.message}`).join(" / ");
      assert.match(m, /bad\.svg: SVG は素材にできません/);
      assert.match(m, /run\.js: 素材にできるのは/);
      assert.match(m, /big\.png: 素材は 1 ファイル/);
      assert.doesNotMatch(m, /ok\.webp/);
      // assets/ の中の .js は、ソースとしてはチェックしない（素材としてだけ断る）
      assert.equal(checkAppSources(dir, "x-app").length, 0);
    });
  });

  it("manifest の新しい値（display、pwa、storage、ai）の範囲と、AI の宣言の食い違いを知らせる", async () => {
    const root = mkdtempSync(path.join(ROOT, "dist", "check-"));
    try {
      const dir = path.join(root, "x-app");
      mkdirSync(path.join(dir, "assets"), { recursive: true });
      writeFileSync(path.join(dir, "assets/icon.png"), png(8, 8));
      writeFileSync(
        path.join(dir, "manifest.ts"),
        `export const manifest = { id: "x-app", name: "x", description: "x", icon: "x", sharing: false, display: "full", pwa: { themeColor: "red", backgroundColor: "#fff", icon: "icon.png" }, storage: { maxDocs: 20000 }, ai: { purpose: "", sends: [], model: "gpt-4", dailyLimit: 500 } };\n`,
      );
      const m = await checkManifest(dir, "x-app");
      const msgs = m.problems.map((p) => p.message).join(" / ");
      for (const re of [/display/, /pwa\.themeColor/, /512×512/, /storage\.maxDocs/, /ai\.purpose/, /ai\.sends/, /ai\.model/, /ai\.dailyLimit/]) assert.match(msgs, re);
      assert.equal(m.ai, true);
      assert.match((await checkAiTasks(dir, "x-app", true)).map((p) => p.message).join(), /ai\.ts に AI の仕事を書いてください/);
      writeFileSync(path.join(dir, "App.tsx"), `import { useAppAI } from "@/apps-sdk";\nexport default function App() { useAppAI(); return null; }\n`);
      assert.match(checkCapabilityUsage(dir, "x-app", { sharing: false, ai: false }).map((p) => p.message).join(), /useAppAI を使うときは/);
      writeFileSync(
        path.join(dir, "ai.ts"),
        `import { z } from "zod";\nimport { defineAppAI } from "@/apps-sdk";\nexport const ai = defineAppAI({ make: { instructions: "x", output: z.object({ r: z.record(z.string(), z.string()) }) } });\n`,
      );
      assert.match((await checkAiTasks(dir, "x-app", false)).map((p) => p.message).join(" / "), /manifest に ai.*JSON Schema にできません/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/** 単色の PNG（テスト用） */
function png(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x88)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
