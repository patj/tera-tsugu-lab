// ポータルのテストの部品
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memorialRequests, memorialServices, memorialServiceTargets } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { DomainError, getStaffById, staffActor, type Actor } from "@/domain/core";
import { consumeLoginLink, getPortalAccount, requestLoginLink, toPortalActor } from "@/domain/portal";

export async function staffOf(seed: SeedContext, key = "staff:jushoku"): Promise<Actor> {
  const s = await getStaffById(seed.get(key));
  assert.ok(s);
  return staffActor(s, "web");
}

/** シードのアカウントの操作者（"portal:tanaka_contact" など） */
export async function portalOf(seed: SeedContext, key: string): Promise<Actor> {
  const a = await getPortalAccount(seed.get(key));
  assert.ok(a, `アカウントがありません: ${key}`);
  return toPortalActor(a);
}

/** メールアドレスでマジックリンクを作り、それを使ってログインする（画面と同じ流れ） */
export async function loginByEmail(email: string): Promise<Actor> {
  const link = await requestLoginLink(email);
  assert.ok(link, `ログインのリンクが作れません: ${email}`);
  return toPortalActor(await consumeLoginLink(link.token));
}

export const rejects = (p: Promise<unknown>, code: string, re?: RegExp) =>
  assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DomainError, String(e));
    assert.equal(e.code, code, e.message);
    if (re) assert.match(e.message, re);
    return true;
  });

/**
 * 04 の bookMemorialService の代わり（04 はまだこの worktree にない）。
 * 申し込みから法要を確定したことにする: memorial_services と対象を作り、申し込みを scheduled にする
 */
export async function bookDirectly(
  seed: SeedContext,
  requestId: string,
  input: { startAt: Date; officiant?: string; location?: string },
): Promise<string> {
  const [req] = await db.select().from(memorialRequests).where(eq(memorialRequests.id, requestId));
  assert.ok(req);
  const [svc] = await db
    .insert(memorialServices)
    .values({
      templeId: req.templeId,
      householdId: req.householdId,
      seshuPersonId: req.seshuPersonId,
      seshuName: req.seshuName,
      location: input.location ?? req.location,
      startAt: input.startAt,
      durationMin: 40,
      officiantStaffId: seed.get(input.officiant ?? "staff:jushoku"),
    })
    .returning({ id: memorialServices.id });
  for (const t of req.targets) {
    await db.insert(memorialServiceTargets).values({
      templeId: req.templeId,
      memorialServiceId: svc.id,
      personId: t.personId,
      kaiki: t.kaiki,
    });
  }
  await db
    .update(memorialRequests)
    .set({ status: "scheduled", memorialServiceId: svc.id })
    .where(eq(memorialRequests.id, requestId));
  return svc.id;
}
