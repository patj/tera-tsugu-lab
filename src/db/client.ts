// DB の接続。Web（Next.js）、MCP サーバー、スクリプト、テストで共通に使う。
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const DEFAULT_DATABASE_URL = "postgres://tera:tera@localhost:5432/tera";

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export type Db = NodePgDatabase<typeof schema>;
/** トランザクションの中で使う DB。ほかの機能の関数に渡して、同じトランザクションで書き込む */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** トランザクションの中でも外でも使える DB */
export type DbOrTx = Db | Tx;

// Next.js の開発サーバーはモジュールを読み直すので、接続をグローバルに 1 つだけ持つ
const globalForDb = globalThis as unknown as { __teraPool?: Pool; __teraDb?: Db };

function createPool(): Pool {
  // 日時は timestamptz で持ち、セッションのタイムゾーンを日本にそろえる
  return new Pool({ connectionString: databaseUrl(), options: "-c timezone=Asia/Tokyo" });
}

export const pool: Pool = globalForDb.__teraPool ?? createPool();
export const db: Db = globalForDb.__teraDb ?? drizzle(pool, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__teraPool = pool;
  globalForDb.__teraDb = db;
}

/** スクリプトやテストの最後に呼ぶ */
export async function closeDb(): Promise<void> {
  await pool.end();
  globalForDb.__teraPool = undefined;
  globalForDb.__teraDb = undefined;
}
