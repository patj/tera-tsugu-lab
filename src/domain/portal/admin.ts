// スタッフの管理画面（/admin/portal）: 招待コードの一覧、アカウントの一覧、家族の権限の代行設定
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { households, persons, portalAccounts, portalInvites } from "@/db/schema";
import { invalid, notFound, writeAuditLog, type Actor } from "@/domain/core";
import { addContactLog, getHouseholdBasics, getHouseholdMembers } from "@/domain/ledger";
import { getPortalAccount } from "./auth";
import { formatInviteCode, inviteUrl } from "./codes";
import { assertStaff, inTx, isUuid } from "./common";
import { householdAccounts, permissionSummary } from "./family";

export type InviteStatus = "unused" | "used" | "expired";

export type PortalInviteEntry = {
  id: string;
  code: string;
  /** 表示用（ABCD-EFGH） */
  displayCode: string;
  /** QR コードにする URL */
  url: string;
  status: InviteStatus;
  personId: string;
  personName: string;
  relation: string | null;
  householdId: string;
  householdName: string;
  householdAddress: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export function inviteStatus(inv: { usedAt: Date | null; expiresAt: Date }, now: Date): InviteStatus {
  if (inv.usedAt) return "used";
  return inv.expiresAt <= now ? "expired" : "unused";
}

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = { unused: "未使用", used: "使用済み", expired: "期限切れ" };

/** 招待コードの一覧（新しい順）。status、世帯、ID で絞り込める（印刷の画面で使う） */
export async function listPortalInvites(
  actor: Actor,
  opts: { status?: InviteStatus | "all"; householdId?: string; ids?: string[]; now?: Date } = {},
  conn: DbOrTx = db,
): Promise<PortalInviteEntry[]> {
  assertStaff(actor);
  const now = opts.now ?? new Date();
  const conds: SQL[] = [eq(portalInvites.templeId, actor.templeId)];
  if (opts.householdId) {
    if (!isUuid(opts.householdId)) return [];
    conds.push(eq(persons.householdId, opts.householdId));
  }
  if (opts.ids) {
    const ids = opts.ids.filter(isUuid);
    if (ids.length === 0) return [];
    conds.push(inArray(portalInvites.id, ids));
  }
  const rows = await conn
    .select({
      id: portalInvites.id,
      code: portalInvites.code,
      expiresAt: portalInvites.expiresAt,
      usedAt: portalInvites.usedAt,
      createdAt: portalInvites.createdAt,
      personId: persons.id,
      familyName: persons.familyName,
      givenName: persons.givenName,
      relation: persons.relation,
      householdId: households.id,
      householdName: households.name,
      householdAddress: households.address,
    })
    .from(portalInvites)
    .innerJoin(persons, eq(persons.id, portalInvites.personId))
    .innerJoin(households, eq(households.id, persons.householdId))
    .where(and(...conds))
    .orderBy(desc(portalInvites.createdAt), asc(households.kana), asc(persons.birthDate));
  return rows
    .map((r) => ({
      id: r.id,
      code: r.code,
      displayCode: formatInviteCode(r.code),
      url: inviteUrl(r.code),
      status: inviteStatus(r, now),
      personId: r.personId,
      personName: `${r.familyName} ${r.givenName}`,
      relation: r.relation,
      householdId: r.householdId,
      householdName: r.householdName,
      householdAddress: r.householdAddress,
      expiresAt: r.expiresAt,
      usedAt: r.usedAt,
      createdAt: r.createdAt,
    }))
    .filter((r) => !opts.status || opts.status === "all" || r.status === opts.status);
}

export type InviteCandidate = {
  personId: string;
  name: string;
  relation: string | null;
  isContact: boolean;
  isHead: boolean;
  hasAccount: boolean;
  unusedInvites: number;
};

/** 招待コードを発行する相手の候補（世帯の生きている家族） */
export async function listInviteCandidates(
  actor: Actor,
  householdId: string,
  opts: { now?: Date } = {},
  conn: DbOrTx = db,
): Promise<{ household: { id: string; name: string }; members: InviteCandidate[] }> {
  assertStaff(actor);
  const h = isUuid(householdId) ? await getHouseholdBasics(householdId, conn) : null;
  if (!h || h.templeId !== actor.templeId) throw notFound("世帯が見つかりません");
  const members = await getHouseholdMembers(h.id, conn);
  const accounts = await householdAccounts(h.id, conn);
  const invites = await listPortalInvites(actor, { householdId: h.id, status: "unused", now: opts.now }, conn);
  return {
    household: { id: h.id, name: h.name },
    members: members.map((m) => ({
      personId: m.id,
      name: m.name,
      relation: m.relation,
      isContact: m.isContact,
      isHead: m.isHead,
      hasAccount: accounts.has(m.id),
      unusedInvites: invites.filter((i) => i.personId === m.id).length,
    })),
  };
}

export type PortalAccountEntry = {
  id: string;
  personId: string;
  personName: string;
  relation: string | null;
  householdId: string;
  householdName: string;
  email: string;
  /** 窓口か（世帯の contact_person_id から毎回決める） */
  isContact: boolean;
  canViewHousehold: boolean;
  canApplyMemorial: boolean;
  /** 本人が故人になった、世帯が離檀・転出した（ログインできない） */
  disabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

/** ポータルのアカウントの一覧（誰が登録したか、最後のログイン）。世帯のカナ、家族の生年月日の順 */
export async function listPortalAccounts(
  actor: Actor,
  opts: { householdId?: string } = {},
  conn: DbOrTx = db,
): Promise<PortalAccountEntry[]> {
  assertStaff(actor);
  const conds: SQL[] = [eq(portalAccounts.templeId, actor.templeId)];
  if (opts.householdId) {
    if (!isUuid(opts.householdId)) return [];
    conds.push(eq(persons.householdId, opts.householdId));
  }
  const rows = await conn
    .select({
      id: portalAccounts.id,
      personId: portalAccounts.personId,
      email: portalAccounts.email,
      canViewHousehold: portalAccounts.canViewHousehold,
      canApplyMemorial: portalAccounts.canApplyMemorial,
      lastLoginAt: portalAccounts.lastLoginAt,
      createdAt: portalAccounts.createdAt,
      familyName: persons.familyName,
      givenName: persons.givenName,
      relation: persons.relation,
      isDeceased: persons.isDeceased,
      householdId: households.id,
      householdName: households.name,
      householdStatus: households.status,
      contactPersonId: households.contactPersonId,
    })
    .from(portalAccounts)
    .innerJoin(persons, eq(persons.id, portalAccounts.personId))
    .innerJoin(households, eq(households.id, persons.householdId))
    .where(and(...conds))
    .orderBy(asc(households.kana), asc(households.name), asc(persons.birthDate));
  return rows.map((r) => ({
    id: r.id,
    personId: r.personId,
    personName: `${r.familyName} ${r.givenName}`,
    relation: r.relation,
    householdId: r.householdId,
    householdName: r.householdName,
    email: r.email,
    isContact: r.contactPersonId === r.personId,
    canViewHousehold: r.canViewHousehold,
    canApplyMemorial: r.canApplyMemorial,
    disabled: r.isDeceased || r.householdStatus !== "active",
    lastLoginAt: r.lastLoginAt,
    createdAt: r.createdAt,
  }));
}

/** アカウントの詳細（代行設定の画面）。世帯の窓口と、その窓口がポータルに登録しているか */
export async function getPortalAccountForStaff(actor: Actor, accountId: string, conn: DbOrTx = db) {
  assertStaff(actor);
  const list = isUuid(accountId) ? await listPortalAccounts(actor, {}, conn) : [];
  const account = list.find((a) => a.id === accountId);
  if (!account) throw notFound("アカウントが見つかりません");
  const h = await getHouseholdBasics(account.householdId, conn);
  const members = await getHouseholdMembers(account.householdId, conn);
  const contact = members.find((m) => m.id === h?.contactPersonId) ?? null;
  const contactAccount = list.find((a) => a.personId === contact?.id) ?? null;
  return {
    account,
    contact: contact ? { personId: contact.id, name: contact.name, hasAccount: Boolean(contactAccount) } : null,
  };
}

export type StaffFamilyPermissionInput = {
  portalAccountId: string;
  canViewHousehold: boolean;
  canApplyMemorial: boolean;
  /** 窓口の意向をどう確かめたか（例: 「窓口の健一さんに電話で確認」）。必須 */
  confirmation: string;
};

/**
 * 家族の権限を、スタッフが代わりに設定する（窓口がポータルに登録していない場合など）。
 * 窓口の意向を確かめたことを必須にし、監査ログと台帳の対応記録に残す（1 つのトランザクション）
 */
export async function setFamilyPermissionsByStaff(
  actor: Actor,
  input: StaffFamilyPermissionInput,
  conn: DbOrTx = db,
): Promise<void> {
  assertStaff(actor);
  if (typeof input.canViewHousehold !== "boolean" || typeof input.canApplyMemorial !== "boolean") {
    throw invalid("権限はオンかオフで指定してください");
  }
  const confirmation = (input.confirmation ?? "").trim();
  if (!confirmation) throw invalid("窓口の方の意向をどう確かめたかを入力してください（例: 窓口の健一さんに電話で確認）");
  if (confirmation.length > 500) throw invalid("確認の内容は 500 文字までにしてください");
  const target = isUuid(input.portalAccountId) ? await getPortalAccount(input.portalAccountId, conn) : null;
  if (!target || target.templeId !== actor.templeId) throw notFound("アカウントが見つかりません（ログインできないアカウントは設定できません）");
  const h = await getHouseholdBasics(target.householdId, conn);
  if (h?.contactPersonId === target.personId) throw invalid("窓口の方は、すべての操作ができます（権限の設定は家族の方だけです）");

  const summary = `ポータルの家族の権限を代わりに設定: ${target.displayName}さん（${permissionSummary(input)}）。確認: ${confirmation}`;
  await inTx(conn, async (tx) => {
    await tx
      .update(portalAccounts)
      .set({ canViewHousehold: input.canViewHousehold, canApplyMemorial: input.canApplyMemorial })
      .where(eq(portalAccounts.id, target.id));
    await writeAuditLog(
      actor,
      { action: "portal.family_permission.set_by_staff", target: `portal_account:${target.id}`, summary, result: "ok" },
      tx,
    );
    await addContactLog(actor, tx, { householdId: target.householdId, kind: "その他", body: summary });
  });
}
