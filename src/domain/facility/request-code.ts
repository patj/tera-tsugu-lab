// 申請番号（request_code）。外部の人が状況を確認するのに使う。
// 推測しにくく（30 文字 × 8 桁 ≒ 6500 億通り）、電話でも伝えやすい（0/O、1/I/L、U/V のような紛らわしい文字を使わない）形にする。
// 表示は "ABCD-2345"。入力は小文字、ハイフンなし、全角でも受け付ける。
import { randomInt } from "node:crypto";

/** 紛らわしい文字（0 O 1 I L U）を除いた 30 文字。数字 2〜9 と英字 */
export const REQUEST_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 8;

export function generateRequestCode(): string {
  let s = "";
  for (let i = 0; i < LENGTH; i++) s += REQUEST_CODE_ALPHABET[randomInt(REQUEST_CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** 入力された申請番号を正規化する。形が正しくなければ null */
export function normalizeRequestCode(input: string): string | null {
  const s = input
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-ー－‐]/g, "");
  if (s.length !== LENGTH) return null;
  for (const c of s) if (!REQUEST_CODE_ALPHABET.includes(c)) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
