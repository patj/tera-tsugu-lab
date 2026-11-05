// 署名つきのトークン（ログインの状態を cookie に入れるのに使う）。Next.js に依存しないのでテストできる。
// 形: <payload の base64url>.<HMAC-SHA256 の base64url>
import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenPayload = {
  /** 誰か（スタッフの ID、ポータルのアカウントの ID など） */
  sub: string;
  /** 有効期限（UNIX 時刻、秒） */
  exp: number;
  /** トークンの種類（"staff" / "portal"）。取り違えを防ぐ */
  kind: string;
};

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET を設定してください");
  return "dev-only-secret-change-me-0123456789abcdef";
}

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signToken(payload: TokenPayload, secret = sessionSecret()): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}

/** 署名、種類、有効期限を確かめる。だめなら null */
export function verifyToken(
  token: string | undefined,
  kind: string,
  now: Date = new Date(),
  secret = sessionSecret(),
): TokenPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(hmac(body, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
    if (payload.kind !== kind) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= now.getTime()) return null;
    if (typeof payload.sub !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}
