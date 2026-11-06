// スクリプトで共通に使う関数（DB の作成、スキーマの反映、SQL の適用）
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

export const ROOT = path.resolve(__dirname, "..");

/** 接続先の DB がなければ作る（worktree ごとに別の DB を使うため） */
export async function ensureDatabase(url: string): Promise<void> {
  const u = new URL(url);
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
    throw new Error(`DB の名前は英数字と _ だけにしてください: ${dbName}`);
  }
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const r = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (r.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`DB を作りました: ${dbName}`);
    }
  } finally {
    await client.end();
  }
}

/** public スキーマを消して作り直す */
export async function dropAll(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  } finally {
    await client.end();
  }
}

/**
 * node_modules のコマンドを、いま動いている node で直接実行する。
 * Windows では npx が npx.cmd なので、shell なしの spawnSync("npx") は起動できない。
 */
export function runNodeBin(bin: string, args: string[], env: NodeJS.ProcessEnv): number {
  const r = spawnSync(process.execPath, [path.join(ROOT, "node_modules", bin), ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env,
  });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

/** drizzle-kit push でスキーマを反映する（確認なしで実行する。開発用の DB だけで使う） */
export function pushSchema(url: string): void {
  const status = runNodeBin("drizzle-kit/bin.cjs", ["push", "--force"], { ...process.env, DATABASE_URL: url });
  if (status !== 0) throw new Error("drizzle-kit push に失敗しました");
}

/** src/db/sql/ の SQL を名前の順に流す（push で作れない拡張や排他制約） */
export async function applySql(url: string): Promise<void> {
  const dir = path.join(ROOT, "src/db/sql");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const f of files) {
      await client.query(readFileSync(path.join(dir, f), "utf8"));
    }
  } finally {
    await client.end();
  }
}
