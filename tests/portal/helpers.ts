// ポータルのテストの部品
import assert from "node:assert/strict";
import type { SeedContext } from "@/db/seed/context";
import { DomainError, getStaffById, staffActor, type Actor } from "@/domain/core";
import { bookMemorialService } from "@/domain/memorial";
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

/** 住職（または指定したスタッフ）が、申し込みから法要を確定する（04 の bookMemorialService を使う） */
export async function bookDirectly(
  seed: SeedContext,
  requestId: string,
  input: { startAt: Date; officiant?: string },
): Promise<string> {
  const officiant = input.officiant ?? "staff:jushoku";
  const actor = await staffOf(seed, officiant);
  const r = await bookMemorialService(actor, {
    memorialRequestId: requestId,
    start: input.startAt,
    officiantStaffId: seed.get(officiant),
  });
  return r.serviceId;
}
