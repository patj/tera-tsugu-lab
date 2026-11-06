// お寺のアプリの利用者（匿名）。cookie: tera_apps（パス /apps、1 年）。サーバー側だけで使う。
// 檀家ポータルやスタッフのログインとはひもづけない（spec.md §7）
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor } from "@/domain/core";
import {
  APPS_COOKIE,
  APPS_COOKIE_PATH,
  APPS_SESSION_SECONDS,
  createAppSessionToken,
  findAppUser,
  readAppSessionToken,
  toAppUserActor,
  type AppUser,
} from "@/domain/apps";

export async function startAppSession(userId: string): Promise<void> {
  (await cookies()).set(APPS_COOKIE, createAppSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: APPS_COOKIE_PATH,
    maxAge: APPS_SESSION_SECONDS,
  });
}

/** この端末の利用者。いなければ null */
export async function findAppSession(): Promise<{ user: AppUser; actor: Actor } | null> {
  const id = readAppSessionToken((await cookies()).get(APPS_COOKIE)?.value);
  if (!id) return null;
  const user = await findAppUser(id);
  return user ? { user, actor: toAppUserActor(user) } : null;
}

/** この端末の利用者。いなければ、はじめの画面へ移る */
export async function requireAppSession(): Promise<{ user: AppUser; actor: Actor }> {
  const s = await findAppSession();
  if (!s) redirect("/apps");
  return s;
}
