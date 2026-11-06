// 操作者。ドメイン層の関数は第 1 引数で受け取り、私的な予定の保護やポータルの権限の判定に使う。
/** apps: お寺のアプリの利用者（匿名。spec.md §7） */
export type Channel = "web" | "mcp" | "portal" | "apps";

export type Actor = {
  templeId: string;
  channel: Channel;
  /** スタッフとして操作している場合（管理画面、MCP） */
  staffId?: string;
  /** 檀家としてポータルから操作している場合 */
  portalAccountId?: string;
  personId?: string;
  /** お寺のアプリの利用者として操作している場合（匿名。ほかのアカウントとはひもづけない） */
  appUserId?: string;
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

/** お寺のアプリの利用者。監査ログには、ニックネームではなく ID の先頭だけを残す */
export function appUserActor(user: { id: string; templeId: string }): Actor {
  return {
    templeId: user.templeId,
    channel: "apps",
    appUserId: user.id,
    label: `apps:利用者 ${user.id.slice(0, 8)}`,
  };
}

/** シードやスクリプトのための操作者 */
export function systemActor(templeId: string): Actor {
  return { templeId, channel: "web", label: "system" };
}

export function isStaff(actor: Actor): actor is Actor & { staffId: string } {
  return typeof actor.staffId === "string";
}

/**
 * MCP の操作者か。MCP の結果やエラーの文は LLM の事業者に送られるので、檀家の名前（故人の俗名と法号、家族の名前）を文に入れない。
 * 人は続柄と没年で表す（spec.md §4「LLM に渡す情報」）
 */
export function hidesNames(actor: Actor): boolean {
  return actor.channel === "mcp";
}
