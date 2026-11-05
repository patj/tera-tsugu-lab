// npm run db:push: スキーマを反映し、src/db/sql/ を流す
import { databaseUrl } from "../src/db/client";
import { applySql, ensureDatabase, pushSchema } from "./lib";

async function main() {
  const url = databaseUrl();
  await ensureDatabase(url);
  pushSchema(url);
  await applySql(url);
  console.log("スキーマを反映しました");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
