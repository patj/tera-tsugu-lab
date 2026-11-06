// 招待コードとマジックリンクのトークン（DB を使わない部品）
import { createHash, randomBytes, randomInt } from "node:crypto";

/** 招待コードに使う文字（数字の 0・1 とまぎらわしい O・I・L を除いた英大文字と数字。31 文字） */
export const INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
/** 招待コードの長さ（表示は XXXX-XXXX） */
export const INVITE_CODE_LENGTH = 8;
/** 招待コードの有効期限（寺報や手紙で届けるので長めにする） */
export const INVITE_EXPIRES_DAYS = 90;
/** マジックリンクの有効期限 */
export const LOGIN_LINK_MINUTES = 15;
/** ログインの状態を保つ日数 */
export const PORTAL_SESSION_DAYS = 30;

/** 推測できない招待コード（暗号学的な乱数。31^8 ≒ 8.5 × 10^11 通り） */
export function newInviteCode(): string {
  let s = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) s += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return s;
}

/**
 * 手で入力された招待コードを、保存している形にそろえる。
 * 全角を半角に、小文字を大文字にし、ハイフンや空白を除く。読み違えやすい O → 0 などは直さない（その文字は使っていない）
 */
export function normalizeInviteCode(input: string): string {
  return input
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-‐－ー―]/g, "");
}

/** 表示用（ABCD-EFGH） */
export function formatInviteCode(code: string): string {
  return code.length === INVITE_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function isInviteCodeShape(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  for (const c of code) if (!INVITE_ALPHABET.includes(c)) return false;
  return true;
}

/** マジックリンクのトークン（32 バイトの乱数。URL に入れる） */
export function newLoginToken(): string {
  return randomBytes(32).toString("base64url");
}

/** トークンのハッシュ（DB にはこれだけを保存する） */
export function hashLoginToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** メールアドレスを小文字にそろえる。形が正しくなければ null */
export function normalizePortalEmail(input: string): string | null {
  const e = input.normalize("NFKC").trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) return null;
  return e;
}

/** ポータルの URL の基準（招待コードの QR にする URL など）。APP_BASE_URL を使う */
export function portalBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** 招待コードの登録ページの URL（QR コードにする） */
export function inviteUrl(code: string, base = portalBaseUrl()): string {
  return `${base}/portal/register?code=${encodeURIComponent(code)}`;
}

/** マジックリンクの URL */
export function loginLinkUrl(token: string, base = portalBaseUrl()): string {
  return `${base}/portal/login/verify?token=${encodeURIComponent(token)}`;
}
