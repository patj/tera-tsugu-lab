// 操作者。ドメイン層の関数は第 1 引数で受け取り、私的な予定の保護やポータルの権限の判定に使う。
export type Channel = "web" | "mcp" | "portal";

export type Actor = {
  templeId: string;
  channel: Channel;
  /** スタッフとして操作している場合（管理画面、MCP） */
  staffId?: string;
  /** 檀家としてポータルから操作している場合 */
  portalAccountId?: string;
  personId?: string;
  /** 監査ログに残す表示名 */
  label: string;
};

export function staffActor(
  staff: { id: string; templeId: string; name: string; roleTitle: string },
  channel: "web" | "mcp",
): Actor {
  return {
    templeId: staff.templeId,
    channel,
    staffId: staff.id,
    label: `staff:${staff.roleTitle} ${staff.name}`,
  };
}

export function portalActor(account: {
  id: string;
  templeId: string;
  personId: string;
  displayName: string;
}): Actor {
  return {
    templeId: account.templeId,
    channel: "portal",
    portalAccountId: account.id,
    personId: account.personId,
    label: `portal:${account.displayName}`,
  };
}

/** シードやスクリプトのための操作者 */
export function systemActor(templeId: string): Actor {
  return { templeId, channel: "web", label: "system" };
}

export function isStaff(actor: Actor): actor is Actor & { staffId: string } {
  return typeof actor.staffId === "string";
}
