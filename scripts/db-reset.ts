// npm run db:reset: DB を空にして、スキーマを反映し、シードを入れる（何度でも作り直せる）
import { closeDb, databaseUrl } from "../src/db/client";
import { runSeeds } from "../src/db/seed";
import { applySql, dropAll, ensureDatabase, pushSchema } from "./lib";

async function main() {
  const url = databaseUrl();
  await ensureDatabase(url);
  await dropAll(url);
  pushSchema(url);
  await applySql(url);
  await runSeeds();
  await closeDb();
  console.log("DB を作り直しました");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
