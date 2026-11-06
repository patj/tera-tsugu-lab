// 操作者。ドメイン層の関数は第 1 引数で受け取り、私的な予定の保護やポータルの権限の判定に使う。
/** care: メンタルケアのポータル（匿名の相談者。spec.md §7） */
export type Channel = "web" | "mcp" | "portal" | "care";

export type Actor = {
  templeId: string;
  channel: Channel;
  /** スタッフとして操作している場合（管理画面、MCP） */
  staffId?: string;
  /** 檀家としてポータルから操作している場合 */
  portalAccountId?: string;
  personId?: string;
  /** メンタルケアの相談者として操作している場合（匿名。ほかのアカウントとはひもづけない） */
  careSubjectId?: string;
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

/** メンタルケアの相談者。監査ログには、ニックネームではなく ID の先頭だけを残す */
export function careActor(subject: { id: string; templeId: string }): Actor {
  return {
    templeId: subject.templeId,
    channel: "care",
    careSubjectId: subject.id,
    label: `care:相談者 ${subject.id.slice(0, 8)}`,
  };
}

/** シードやスクリプトのための操作者 */
export function systemActor(templeId: string): Actor {
  return { templeId, channel: "web", label: "system" };
}

export function isStaff(actor: Actor): actor is Actor & { staffId: string } {
  return typeof actor.staffId === "string";
}
