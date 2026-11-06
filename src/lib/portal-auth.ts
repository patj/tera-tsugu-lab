// 檀家ポータルのログインの状態（cookie: tera_portal、kind: "portal"、30 日間）。サーバー側だけで使う。
// スタッフのログイン（tera_staff）とは別。/portal の保護は、各ページとルートハンドラーがここを呼んで行う
// （src/proxy.ts は /admin だけを見る）
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDomainError, type Actor } from "@/domain/core";
import {
  PORTAL_COOKIE,
  PORTAL_SESSION_SECONDS,
  createPortalSessionToken,
  getPortalAccount,
  getPortalContext,
  readPortalSessionToken,
  toPortalActor,
  type PortalAccount,
  type PortalContext,
} from "@/domain/portal";

/** マジックリンクを開発用の画面に表示するための cookie（メールを送る代わり） */
export const PORTAL_DEV_LINK_COOKIE = "tera_portal_devlink";

/** ハッカソン版はメールを送らず、ログイン用のリンクを画面に表示する（本番では表示しない） */
export function showDevLoginLink(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.PORTAL_DEV_MAILBOX === "1";
}

export async function startPortalSession(accountId: string): Promise<void> {
  (await cookies()).set(PORTAL_COOKIE, createPortalSessionToken(accountId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PORTAL_SESSION_SECONDS,
  });
}

export async function endPortalSession(): Promise<void> {
  (await cookies()).delete(PORTAL_COOKIE);
}

/** ログインしているアカウント。いなければ null */
export async function findCurrentPortal(): Promise<{ account: PortalAccount; actor: Actor } | null> {
  const accountId = readPortalSessionToken((await cookies()).get(PORTAL_COOKIE)?.value);
  if (!accountId) return null;
  const account = await getPortalAccount(accountId);
  return account ? { account, actor: toPortalActor(account) } : null;
}

/** ログインしている操作者と、立場・権限。いなければログインの画面へ移る */
export async function requirePortal(): Promise<{ actor: Actor; ctx: PortalContext }> {
  const cur = await findCurrentPortal();
  if (!cur) redirect("/portal/login");
  try {
    return { actor: cur.actor, ctx: await getPortalContext(cur.actor) };
  } catch (e) {
    if (isDomainError(e)) redirect("/portal/login");
    throw e;
  }
}
