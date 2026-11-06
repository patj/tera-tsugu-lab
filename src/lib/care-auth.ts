// ケアのポータルの相談者（匿名）。cookie: tera_care（パス /care、1 年）。サーバー側だけで使う。
// 檀家ポータルやスタッフのログインとはひもづけない（spec.md §7）
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor } from "@/domain/core";
import {
  CARE_COOKIE,
  CARE_COOKIE_PATH,
  CARE_SESSION_SECONDS,
  createCareSessionToken,
  findCareSubject,
  readCareSessionToken,
  toCareActor,
  type CareSubject,
} from "@/domain/care";

export async function startCareSession(subjectId: string): Promise<void> {
  (await cookies()).set(CARE_COOKIE, createCareSessionToken(subjectId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: CARE_COOKIE_PATH,
    maxAge: CARE_SESSION_SECONDS,
  });
}

/** この端末の相談者。いなければ null */
export async function findCareSession(): Promise<{ subject: CareSubject; actor: Actor } | null> {
  const id = readCareSessionToken((await cookies()).get(CARE_COOKIE)?.value);
  if (!id) return null;
  const subject = await findCareSubject(id);
  return subject ? { subject, actor: toCareActor(subject) } : null;
}

/** この端末の相談者。いなければ、はじめの画面へ移る */
export async function requireCareSession(): Promise<{ subject: CareSubject; actor: Actor }> {
  const s = await findCareSession();
  if (!s) redirect("/care");
  return s;
}
