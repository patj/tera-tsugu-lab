// ポータルの権限の判定（ドメイン層で行う。spec.md §2.1、docs/roles.md）
// - 窓口: 世帯の contact_person_id の人。毎回、台帳から引いて判定する（保存しない）。窓口が交代すると、新しい窓口に権限が移る
// - 家族: 窓口以外の人。can_view_household（家系図と法要の予定を見る）、can_apply_memorial（代理で法要を申し込む）は
//   窓口が家族ごとに与える。初期値はどちらもオフ。窓口が交代しても、家族に与えた権限は残る
// - 他の家の情報は見られない（世帯は、操作者のアカウントの本人から決める。画面から来た世帯の ID は信じない）
import { db, type DbOrTx } from "@/db/client";
import { forbidden, type Actor } from "@/domain/core";
import { getHouseholdBasics, getLivingMember, type HouseholdBasics, type HouseholdMember } from "@/domain/ledger";
import { getPortalAccount, type PortalAccount } from "./auth";

export type PortalRole = "contact" | "family";

export type PortalPermissions = {
  /** 家系図と家の法要の予定、家の法要の申し込みの状況を見る */
  viewHousehold: boolean;
  /** 法要を申し込む（窓口、または代理を許可された家族） */
  applyMemorial: boolean;
  /** 家族の権限を設定する（窓口だけ） */
  manageFamily: boolean;
  /** 世帯の行事の申し込みを見る（窓口だけ。家族は自分の申し込みだけ） */
  viewHouseholdResponses: boolean;
};

export type PortalContext = {
  account: PortalAccount;
  person: HouseholdMember;
  household: HouseholdBasics;
  role: PortalRole;
  isContact: boolean;
  /** 世帯の窓口の名前（家族の画面で「窓口の〇〇さんが許可すると…」と案内する） */
  contactName: string | null;
  can: PortalPermissions;
};

/** 窓口かどうかと、家族の権限から、できることを決める（DB を使わない） */
export function resolvePermissions(
  account: Pick<PortalAccount, "personId" | "canViewHousehold" | "canApplyMemorial">,
  household: Pick<HouseholdBasics, "contactPersonId">,
): { role: PortalRole; isContact: boolean; can: PortalPermissions } {
  const isContact = household.contactPersonId === account.personId;
  return {
    role: isContact ? "contact" : "family",
    isContact,
    can: {
      viewHousehold: isContact || account.canViewHousehold,
      applyMemorial: isContact || account.canApplyMemorial,
      manageFamily: isContact,
      viewHouseholdResponses: isContact,
    },
  };
}

/**
 * ポータルの操作者の立場と権限。ポータルの操作者でない、アカウントがない、本人が故人になった、
 * 世帯が離檀・転出した、操作者の本人とアカウントが食い違う、ときは forbidden
 */
export async function getPortalContext(actor: Actor, conn: DbOrTx = db): Promise<PortalContext> {
  if (actor.channel !== "portal" || !actor.portalAccountId || !actor.personId) {
    throw forbidden("ポータルにログインしてください");
  }
  const account = await getPortalAccount(actor.portalAccountId, conn);
  if (!account || account.personId !== actor.personId || account.templeId !== actor.templeId) {
    throw forbidden("ポータルにログインしてください");
  }
  const person = await getLivingMember(account.personId, conn);
  const household = await getHouseholdBasics(account.householdId, conn);
  if (!person || !household || household.status !== "active" || person.householdId !== household.id) {
    throw forbidden("このアカウントは使えません。お寺にお問い合わせください");
  }
  const resolved = resolvePermissions(account, household);
  const contact = resolved.isContact
    ? person
    : household.contactPersonId
      ? await getLivingMember(household.contactPersonId, conn)
      : null;
  return { account, person, household, contactName: contact?.name ?? null, ...resolved };
}

export async function requireViewHousehold(actor: Actor, conn: DbOrTx = db): Promise<PortalContext> {
  const ctx = await getPortalContext(actor, conn);
  if (!ctx.can.viewHousehold) {
    throw forbidden("家系図と家の法要の予定は、窓口の方と、窓口から許可されたご家族だけが見られます");
  }
  return ctx;
}

export async function requireApplyMemorial(actor: Actor, conn: DbOrTx = db): Promise<PortalContext> {
  const ctx = await getPortalContext(actor, conn);
  if (!ctx.can.applyMemorial) {
    throw forbidden("法要の申し込みは、窓口の方と、窓口から代理を許可されたご家族だけができます");
  }
  return ctx;
}

export async function requireContact(actor: Actor, conn: DbOrTx = db): Promise<PortalContext> {
  const ctx = await getPortalContext(actor, conn);
  if (!ctx.can.manageFamily) throw forbidden("家族の権限は、窓口の方だけが設定できます");
  return ctx;
}
