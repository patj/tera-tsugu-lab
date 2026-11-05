// テスト用の DB の準備。npm test が、テスト用の DB（<DB の名前>_test）にスキーマを反映してから呼ぶ。
// テストはファイルを 1 つずつ順に流す（--test-concurrency=1）ので、各テストの最初に resetDb() で空にしてよい。
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { runSeeds } from "@/db/seed";
import type { SeedContext } from "@/db/seed/context";

function assertTestDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/_test(\?|$)/.test(url)) {
    throw new Error("テストは npm test から流してください（テスト用の DB 以外を消さないため）");
  }
}

/** すべてのテーブルを空にする */
export async function truncateAll(): Promise<void> {
  assertTestDb();
  const r = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const names = r.rows.map((row) => `"${row.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
}

/** すべてのテーブルを空にして、シード（npm run db:reset と同じもの）を入れる */
export async function resetDb(): Promise<SeedContext> {
  await truncateAll();
  return runSeeds();
}
