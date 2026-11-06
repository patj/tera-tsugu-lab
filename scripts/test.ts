// npm test: テスト用の DB（<DB の名前>_test）を作り直してから、tests/ のテストを流す
// 一部だけ流す: npm test -- tests/core/time.test.ts
import { databaseUrl } from "../src/db/client";
import { applySql, dropAll, ensureDatabase, pushSchema, runNodeBin } from "./lib";

export function testDatabaseUrl(url: string): string {
  const u = new URL(url);
  const name = u.pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) u.pathname = `/${name}_test`;
  return u.toString();
}

async function main() {
  const url = testDatabaseUrl(databaseUrl());
  await ensureDatabase(url);
  await dropAll(url);
  pushSchema(url);
  await applySql(url);

  const targets = process.argv.slice(2);
  const files = targets.length > 0 ? targets : ["tests/**/*.test.ts"];
  const status = runNodeBin("tsx/dist/cli.mjs", ["--test", "--test-concurrency=1", ...files], {
    ...process.env,
    DATABASE_URL: url,
    NODE_ENV: "test",
  });
  process.exit(status);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
