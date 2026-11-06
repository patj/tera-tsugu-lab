// 家族の権限（can_view_household、can_apply_memorial）。窓口がポータルで設定する。
// スタッフの代行（窓口の意向を確かめて設定する）は admin.ts
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { persons, portalAccounts } from "@/db/schema";
import { forbidden, invalid, notFound, writeAuditLog, type Actor } from "@/domain/core";
import { getHouseholdMembers } from "@/domain/ledger";
import { requireContact } from "./access";
import { getPortalAccount } from "./auth";
import { inTx, isUuid } from "./common";

export type FamilyPermissionEntry = {
  personId: string;
  name: string;
  relation: string | null;
  /** ポータルのアカウント（まだ登録していなければ null） */
  account: {
    id: string;
    canViewHousehold: boolean;
    canApplyMemorial: boolean;
    lastLoginAt: Date | null;
  } | null;
};

/** 世帯のアカウント（人の ID → アカウント） */
export async function householdAccounts(householdId: string, conn: DbOrTx = db) {
  const rows = await conn
    .select({
      id: portalAccounts.id,
      personId: portalAccounts.personId,
      email: portalAccounts.email,
      canViewHousehold: portalAccounts.canViewHousehold,
      canApplyMemorial: portalAccounts.canApplyMemorial,
      lastLoginAt: portalAccounts.lastLoginAt,
      createdAt: portalAccounts.createdAt,
    })
    .from(portalAccounts)
    .innerJoin(persons, eq(persons.id, portalAccounts.personId))
    .where(eq(persons.householdId, householdId));
  return new Map(rows.map((r) => [r.personId, r]));
}

/** 家族の一覧と、それぞれの権限（窓口だけ。窓口本人は除く） */
export async function listFamilyPermissions(actor: Actor, conn: DbOrTx = db): Promise<FamilyPermissionEntry[]> {
  const ctx = await requireContact(actor, conn);
  const members = await getHouseholdMembers(ctx.household.id, conn);
  const accounts = await householdAccounts(ctx.household.id, conn);
  return members
    .filter((m) => m.id !== ctx.person.id)
    .map((m) => {
      const a = accounts.get(m.id);
      return {
        personId: m.id,
        name: m.name,
        relation: m.relation,
        account: a
          ? { id: a.id, canViewHousehold: a.canViewHousehold, canApplyMemorial: a.canApplyMemorial, lastLoginAt: a.lastLoginAt }
          : null,
      };
    });
}

export type FamilyPermissionInput = {
  portalAccountId: string;
  canViewHousehold: boolean;
  canApplyMemorial: boolean;
};

export function permissionSummary(p: { canViewHousehold: boolean; canApplyMemorial: boolean }): string {
  return `家の情報を見る: ${p.canViewHousehold ? "オン" : "オフ"}、代わりに法要を申し込む: ${p.canApplyMemorial ? "オン" : "オフ"}`;
}

/** 家族の権限を変える（窓口だけ）。同じ世帯の、窓口以外のアカウントだけ。監査ログに残す */
export async function setFamilyPermissions(
  actor: Actor,
  input: FamilyPermissionInput,
  conn: DbOrTx = db,
): Promise<void> {
  const ctx = await requireContact(actor, conn);
  if (typeof input.canViewHousehold !== "boolean" || typeof input.canApplyMemorial !== "boolean") {
    throw invalid("権限はオンかオフで指定してください");
  }
  const target = isUuid(input.portalAccountId) ? await getPortalAccount(input.portalAccountId, conn) : null;
  if (!target || target.templeId !== ctx.account.templeId) throw notFound("ご家族のアカウントが見つかりません");
  if (target.householdId !== ctx.household.id) throw forbidden("ほかの家の方の権限は変えられません");
  if (target.personId === ctx.person.id) throw invalid("窓口の方は、すべての操作ができます（ご自身の権限は変えられません）");

  await inTx(conn, async (tx) => {
    await tx
      .update(portalAccounts)
      .set({ canViewHousehold: input.canViewHousehold, canApplyMemorial: input.canApplyMemorial })
      .where(and(eq(portalAccounts.id, target.id), eq(portalAccounts.templeId, ctx.account.templeId)));
    await writeAuditLog(
      actor,
      {
        action: "portal.family_permission.set",
        target: `portal_account:${target.id}`,
        summary: `窓口の${ctx.person.name}さんが、${target.displayName}さんの権限を設定（${permissionSummary(input)}）`,
        result: "ok",
      },
      tx,
    );
  });
}
