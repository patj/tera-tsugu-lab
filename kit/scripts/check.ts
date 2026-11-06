// npm run apps:check: アプリの規約違反を探す（本体と同じチェック。apps.ts は本体からコピーしたもの）
import { check, listAppDirs, ROOT } from "./apps";

async function main() {
  const problems = await check(ROOT, { registry: false });
  if (problems.length === 0) {
    console.log(`規約違反はありません（${listAppDirs().join(", ") || "アプリなし"}）`);
    return;
  }
  for (const p of problems) console.error(`✗ apps/${p.app}${p.file ? `/${p.file}` : ""}: ${p.message}`);
  console.error(`\n${problems.length} 件の規約違反があります（apps/CLAUDE.md を参照）`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
