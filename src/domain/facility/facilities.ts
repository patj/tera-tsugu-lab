// 施設（本堂、東席、中席、西席、庭園）
import { and, asc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { facilities } from "@/db/schema";
import { notFound } from "@/domain/core";

export type Facility = { id: string; templeId: string; name: string; position: number };

/** 本堂の名前（法要で押さえる施設） */
export const MAIN_HALL_NAME = "本堂";

/** 表示順に並べた施設の一覧 */
export async function listFacilities(templeId: string, conn: DbOrTx = db): Promise<Facility[]> {
  return conn
    .select({ id: facilities.id, templeId: facilities.templeId, name: facilities.name, position: facilities.position })
    .from(facilities)
    .where(eq(facilities.templeId, templeId))
    .orderBy(asc(facilities.position), asc(facilities.name));
}

/** お寺の施設を 1 つ取る。なければ notFound */
export async function getFacility(templeId: string, facilityId: string, conn: DbOrTx = db): Promise<Facility> {
  const rows = await listFacilities(templeId, conn);
  const f = rows.find((r) => r.id === facilityId);
  if (!f) throw notFound("施設が見つかりません");
  return f;
}

/**
 * 施設を名前か ID で探す（MCP で「本堂」のように指定されたとき）。前後の空白と「の間」などの違いは見ない。
 * 見つからなければ、施設の名前の一覧を添えて notFound。
 */
export async function findFacility(templeId: string, nameOrId: string, conn: DbOrTx = db): Promise<Facility> {
  const rows = await listFacilities(templeId, conn);
  const q = nameOrId.trim();
  const f =
    rows.find((r) => r.id === q) ??
    rows.find((r) => r.name === q) ??
    rows.find((r) => q.includes(r.name) || r.name.includes(q));
  if (!f) throw notFound(`施設「${q}」が見つかりません。施設: ${rows.map((r) => r.name).join("、")}`);
  return f;
}

/** 本堂の ID（04 が法要の候補を出すときと、本堂の予約を作るときに使う） */
export async function getMainHallId(templeId: string, conn: DbOrTx = db): Promise<string> {
  const [row] = await conn
    .select({ id: facilities.id })
    .from(facilities)
    .where(and(eq(facilities.templeId, templeId), eq(facilities.name, MAIN_HALL_NAME)));
  if (!row) throw notFound("本堂が登録されていません");
  return row.id;
}
