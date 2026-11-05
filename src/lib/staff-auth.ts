// スタッフのログインの状態（管理画面）。サーバー側だけで使う。
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStaffById, staffActor, type Actor, type Staff } from "@/domain/core";
import { signToken, verifyToken } from "./signed-token";

export const STAFF_COOKIE = "tera_staff";
const STAFF_SESSION_DAYS = 7;

export async function startStaffSession(staffId: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + STAFF_SESSION_DAYS * 24 * 60 * 60;
  const token = signToken({ sub: staffId, exp, kind: "staff" });
  (await cookies()).set(STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STAFF_SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endStaffSession(): Promise<void> {
  (await cookies()).delete(STAFF_COOKIE);
}

/** ログインしているスタッフ。いなければ null */
export async function findCurrentStaff(): Promise<Staff | null> {
  const payload = verifyToken((await cookies()).get(STAFF_COOKIE)?.value, "staff");
  if (!payload) return null;
  const s = await getStaffById(payload.sub);
  return s && s.canLogin ? s : null;
}

/** ログインしているスタッフ。いなければログインの画面へ移る */
export async function getCurrentStaff(): Promise<Staff> {
  const s = await findCurrentStaff();
  if (!s) redirect("/login");
  return s;
}

/** 管理画面からドメイン層を呼ぶときの操作者 */
export async function getStaffActor(): Promise<Actor> {
  return staffActor(await getCurrentStaff(), "web");
}
