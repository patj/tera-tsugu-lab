// ポータルのログインの状態（cookie に入れる署名つきのトークン）。Next.js に依存しないのでテストできる。
// cookie の読み書きは src/lib/portal-auth.ts が行う。スタッフのトークン（kind = "staff"）とは取り違えない
import { signToken, verifyToken } from "@/lib/signed-token";
import { PORTAL_SESSION_DAYS } from "./codes";

export const PORTAL_COOKIE = "tera_portal";
export const PORTAL_TOKEN_KIND = "portal";
export const PORTAL_SESSION_SECONDS = PORTAL_SESSION_DAYS * 24 * 60 * 60;

/** ログインの状態のトークン（30 日間有効） */
export function createPortalSessionToken(accountId: string, now: Date = new Date()): string {
  const exp = Math.floor(now.getTime() / 1000) + PORTAL_SESSION_SECONDS;
  return signToken({ sub: accountId, exp, kind: PORTAL_TOKEN_KIND });
}

/** トークンからアカウントの ID を取り出す。署名、種類、期限のどれかがだめなら null */
export function readPortalSessionToken(token: string | undefined, now: Date = new Date()): string | null {
  return verifyToken(token, PORTAL_TOKEN_KIND, now)?.sub ?? null;
}
