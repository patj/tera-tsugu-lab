// お寺と設定の読み込み
import { eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { temples, type TempleSettings } from "@/db/schema";
import { notFound } from "./errors";
import { getSectPreset, type SectPreset } from "./sect";

export type { TempleSettings };

/** 設定の初期値（spec.md §9） */
export const DEFAULT_TEMPLE_SETTINGS: TempleSettings = {
  memorialDurationMin: 40,
  bufferMin: 10,
  slotFirstStart: "10:00",
  slotLastStart: "15:00",
  slotStepMin: 60,
};

export type Temple = {
  id: string;
  name: string;
  sect: string;
  settings: TempleSettings;
  preset: SectPreset;
};

export async function getTemple(templeId: string, conn: DbOrTx = db): Promise<Temple> {
  const [row] = await conn.select().from(temples).where(eq(temples.id, templeId));
  if (!row) throw notFound("お寺が見つかりません");
  return {
    id: row.id,
    name: row.name,
    sect: row.sect,
    settings: { ...DEFAULT_TEMPLE_SETTINGS, ...row.settings },
    preset: getSectPreset(row.sect),
  };
}

export async function getTempleSettings(templeId: string, conn: DbOrTx = db): Promise<TempleSettings> {
  return (await getTemple(templeId, conn)).settings;
}

/** ハッカソン版はお寺が 1 つだけなので、最初のお寺を返す（公開ページなど、操作者がいない入口で使う） */
export async function getDefaultTempleId(conn: DbOrTx = db): Promise<string> {
  const [row] = await conn.select({ id: temples.id }).from(temples).orderBy(temples.createdAt).limit(1);
  if (!row) throw notFound("お寺が登録されていません。npm run db:reset を実行してください");
  return row.id;
}
