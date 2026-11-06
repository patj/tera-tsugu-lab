// お寺のアプリの文書の暗号化（AES-256-GCM）。spec.md §1、§7
// 形: v1:<iv>:<tag>:<暗号文>（base64url）。利用者とアプリの ID を追加の認証データ（AAD）にして、文書の付け替えを防ぐ。
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const DEV_KEY = Buffer.from("dev-only-apps-key-change-me-0123", "utf8"); // 32 バイト

/** 鍵（APPS_ENCRYPTION_KEY: 32 バイトを base64 で）。本番で未設定ならエラー */
export function appsKey(): Buffer {
  const raw = process.env.APPS_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("APPS_ENCRYPTION_KEY は 32 バイトを base64 にしたものにしてください（openssl rand -base64 32）");
    return key;
  }
  if (process.env.NODE_ENV === "production") throw new Error("APPS_ENCRYPTION_KEY を設定してください");
  return DEV_KEY;
}

function aad(userId: string, appId: string): Buffer {
  return Buffer.from(`apps:${userId}:${appId}`, "utf8");
}

export function encryptAppData(plaintext: string, userId: string, appId: string, key = appsKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(userId, appId));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}

/** 復号する。改ざんや付け替え、鍵の違いがあれば例外を投げる（例外のメッセージに本文は入らない） */
export function decryptAppData(ciphertext: string, userId: string, appId: string, key = appsKey()): string {
  const [v, ivB, tagB, ctB] = ciphertext.split(":");
  if (v !== "v1" || !ivB || !tagB || ctB === undefined) throw new Error("文書の形式が正しくありません");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64url"));
  decipher.setAAD(aad(userId, appId));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]).toString("utf8");
}
