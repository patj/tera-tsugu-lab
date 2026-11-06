// シードの入口（npm run db:seed。ふだんは npm run db:reset から呼ばれる）。
// 機能を足すときは、import と SEEDS にそれぞれ 1 行を追記する。順番が依存関係になる（先に作ったものの ID を後で使う）。
import { closeDb, db } from "../client";
import { systemActor } from "@/domain/core";
import { createSeedContext, type Seed, type SeedContext } from "./context";
import { coreSeed, seedTemple } from "./core";
import { ledgerSeed } from "./ledger";
import { calendarSeed } from "./calendar";
import { facilitySeed } from "./facility";
import { formsSeed } from "./forms";

const SEEDS: Seed[] = [
  coreSeed,
  ledgerSeed,
  calendarSeed,
  facilitySeed,
  formsSeed,
];

export async function runSeeds(): Promise<SeedContext> {
  const templeId = await seedTemple(db);
  const ctx = createSeedContext(db, templeId, systemActor(templeId));
  for (const seed of SEEDS) {
    await seed.run(ctx);
    console.log(`シード: ${seed.name}`);
  }
  return ctx;
}

// 直接実行されたとき（npm run db:seed）
if (require.main === module) {
  runSeeds()
    .then(() => closeDb())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
