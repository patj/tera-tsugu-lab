// 匿名の相談者（ニックネームだけで始める。ID はランダムに作り、端末の cookie にだけ保存する）。spec.md §7
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { careSubjects } from "@/db/schema";
import { signToken, verifyToken } from "@/lib/signed-token";
import { careActor, type Actor } from "../core/actor";
import { invalid } from "../core/errors";

/** 相談者の cookie（パスは /care。ほかの画面には送らない） */
export const CARE_COOKIE = "tera_care";
export const CARE_COOKIE_PATH = "/care";
export const CARE_SESSION_SECONDS = 365 * 24 * 60 * 60;
const TOKEN_KIND = "care";

export type CareSubject = { id: string; templeId: string; nickname: string; createdAt: Date };

export const NICKNAME_MAX = 20;

export async function startCareSubject(templeId: string, nickname: string, conn: DbOrTx = db): Promise<CareSubject> {
  const name = nickname.normalize("NFKC").trim();
  if (!name) throw invalid("ニックネームを入力してください");
  if (name.length > NICKNAME_MAX) throw invalid(`ニックネームは ${NICKNAME_MAX} 文字以内にしてください`);
  const [s] = await conn.insert(careSubjects).values({ templeId, nickname: name }).returning();
  return { id: s.id, templeId: s.templeId, nickname: s.nickname, createdAt: s.createdAt };
}

export async function findCareSubject(subjectId: string, conn: DbOrTx = db): Promise<CareSubject | null> {
  if (!/^[0-9a-f-]{36}$/i.test(subjectId)) return null;
  const [s] = await conn.select().from(careSubjects).where(eq(careSubjects.id, subjectId));
  return s ? { id: s.id, templeId: s.templeId, nickname: s.nickname, createdAt: s.createdAt } : null;
}

/** 相談者の操作者（ケアのポータルから使う） */
export function toCareActor(subject: CareSubject): Actor {
  return careActor(subject);
}

/** 相談者本人のニックネーム（ケアのポータルの表示用） */
export async function getMyCareSubject(actor: Actor, conn: DbOrTx = db): Promise<CareSubject | null> {
  if (actor.channel !== "care" || !actor.careSubjectId) return null;
  const [s] = await conn
    .select()
    .from(careSubjects)
    .where(and(eq(careSubjects.id, actor.careSubjectId), eq(careSubjects.templeId, actor.templeId)));
  return s ? { id: s.id, templeId: s.templeId, nickname: s.nickname, createdAt: s.createdAt } : null;
}

export function createCareSessionToken(subjectId: string, now = new Date()): string {
  return signToken({ sub: subjectId, exp: Math.floor(now.getTime() / 1000) + CARE_SESSION_SECONDS, kind: TOKEN_KIND });
}

export function readCareSessionToken(token: string | undefined, now = new Date()): string | null {
  return verifyToken(token, TOKEN_KIND, now)?.sub ?? null;
}
