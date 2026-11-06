// 家の情報: 家系図と、家の法要の予定（窓口、または can_view_household の家族）
import { db, type DbOrTx } from "@/db/client";
import { todayJst, type Actor } from "@/domain/core";
import { getFamilyTree } from "@/domain/ledger";
import { requireViewHousehold } from "./access";
import { getHouseholdMemorialSchedule, type HouseholdMemorialSchedule } from "./memorial-adapter";
import { layoutFamilyTree, type TreeLayout } from "./tree";

export type PortalFamilyTree = TreeLayout & { householdName: string; selfPersonId: string };

/**
 * 家系図（故人と、生きている家族）。自分の世帯の人だけを並べる
 * （関係でつながったほかの世帯の人は出さない。他の家の情報は見られないため）
 */
export async function getPortalFamilyTree(actor: Actor, conn: DbOrTx = db): Promise<PortalFamilyTree> {
  const ctx = await requireViewHousehold(actor, conn);
  const tree = await getFamilyTree(ctx.household.id, conn);
  const persons = tree.persons.filter((p) => p.inHousehold && p.householdId === ctx.household.id);
  const ids = new Set(persons.map((p) => p.id));
  const relations = tree.relations.filter((r) => ids.has(r.personId) && ids.has(r.relatedPersonId));
  return { householdName: ctx.household.name, selfPersonId: ctx.person.id, ...layoutFamilyTree({ persons, relations }) };
}

/** 家の法要の予定（確定した法要と、今後の年忌の目安。初期値は今年から 3 年分） */
export async function getPortalMemorialSchedule(
  actor: Actor,
  opts: { today?: string; years?: number } = {},
  conn: DbOrTx = db,
): Promise<HouseholdMemorialSchedule & { householdName: string }> {
  const ctx = await requireViewHousehold(actor, conn);
  // 04 の関数は conn を受け取らない（統合で置き換えるため、約束した形のまま呼ぶ）
  const schedule = await getHouseholdMemorialSchedule(ctx.household.id, {
    today: opts.today ?? todayJst(),
    years: opts.years ?? 3,
  });
  return { householdName: ctx.household.name, ...schedule };
}
