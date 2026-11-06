// ポータルのドメイン層の共通の部品
import { db, type DbOrTx } from "@/db/client";
import { forbidden, isStaff, type Actor } from "@/domain/core";

/** トランザクションの外から呼ばれたら、トランザクションを始める（中から呼ばれたら、そのトランザクションで続ける） */
export async function inTx<T>(conn: DbOrTx, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return conn === db ? db.transaction((tx) => fn(tx)) : fn(conn);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

/** スタッフだけができる操作（ポータルの管理画面） */
export function assertStaff(actor: Actor): asserts actor is Actor & { staffId: string } {
  if (!isStaff(actor)) throw forbidden("この操作はスタッフだけができます");
}

export const LOCATION_LABELS = { temple: "お寺（本堂）", home: "ご自宅", grave: "お墓（墓前）" } as const;
export const REQUEST_STATUS_LABELS = { requested: "受付済み", scheduled: "確定", declined: "お断り" } as const;
