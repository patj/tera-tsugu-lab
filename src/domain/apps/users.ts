// 匿名の利用者（ニックネームだけで始める。ID はランダムに作り、端末の cookie にだけ保存する）。spec.md §7
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { appUsers } from "@/db/schema";
import { signToken, verifyToken } from "@/lib/signed-token";
import { appUserActor, type Actor } from "../core/actor";
import { invalid } from "../core/errors";
import { isUuid } from "./guard";

/** 利用者の cookie（パスは /apps。ほかの画面には送らない） */
export const APPS_COOKIE = "tera_apps";
export const APPS_COOKIE_PATH = "/apps";
export const APPS_SESSION_SECONDS = 365 * 24 * 60 * 60;
const TOKEN_KIND = "apps";

export type AppUser = { id: string; templeId: string; nickname: string; createdAt: Date };

export const NICKNAME_MAX = 20;

export async function startAppUser(templeId: string, nickname: string, conn: DbOrTx = db): Promise<AppUser> {
  const name = nickname.normalize("NFKC").trim();
  if (!name) throw invalid("ニックネームを入力してください");
  if (name.length > NICKNAME_MAX) throw invalid(`ニックネームは ${NICKNAME_MAX} 文字以内にしてください`);
  const [u] = await conn.insert(appUsers).values({ templeId, nickname: name }).returning();
  return { id: u.id, templeId: u.templeId, nickname: u.nickname, createdAt: u.createdAt };
}

export async function findAppUser(userId: string, conn: DbOrTx = db): Promise<AppUser | null> {
  if (!isUuid(userId)) return null;
  const [u] = await conn.select().from(appUsers).where(eq(appUsers.id, userId));
  return u ? { id: u.id, templeId: u.templeId, nickname: u.nickname, createdAt: u.createdAt } : null;
}

/** 利用者の操作者（お寺のアプリの画面から使う） */
export function toAppUserActor(user: AppUser): Actor {
  return appUserActor(user);
}

/** スタッフ向け: 利用者のニックネーム（同じお寺の利用者だけ） */
export async function getAppUserNickname(templeId: string, userId: string, conn: DbOrTx = db): Promise<string | null> {
  if (!isUuid(userId)) return null;
  const [u] = await conn
    .select({ nickname: appUsers.nickname })
    .from(appUsers)
    .where(and(eq(appUsers.id, userId), eq(appUsers.templeId, templeId)));
  return u?.nickname ?? null;
}

export function createAppSessionToken(userId: string, now = new Date()): string {
  return signToken({ sub: userId, exp: Math.floor(now.getTime() / 1000) + APPS_SESSION_SECONDS, kind: TOKEN_KIND });
}

export function readAppSessionToken(token: string | undefined, now = new Date()): string | null {
  return verifyToken(token, TOKEN_KIND, now)?.sub ?? null;
}
