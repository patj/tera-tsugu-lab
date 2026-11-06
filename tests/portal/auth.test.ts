// ポータルの認証: 招待コード、登録、マジックリンク、ログインの状態
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { auditLogs, portalAccounts, portalInvites, portalLoginTokens } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { SEED_EXPIRED_INVITE, SEED_PORTAL_INVITES } from "@/db/seed/portal";
import { updateHousehold, updatePerson, getHouseholdBasics } from "@/domain/ledger";
import {
  INVITE_ALPHABET,
  PORTAL_SESSION_SECONDS,
  consumeLoginLink,
  createPortalSessionToken,
  formatInviteCode,
  getPortalAccount,
  hashLoginToken,
  issueInvite,
  lookupInvite,
  normalizeInviteCode,
  readPortalSessionToken,
  registerWithInvite,
  requestLoginLink,
} from "@/domain/portal";
import { signToken } from "@/lib/signed-token";
import { resetDb } from "../helpers/db";
import { portalOf, rejects, staffOf } from "./helpers";

let seed: SeedContext;

const inviteCode = (key: string) => SEED_PORTAL_INVITES.find((i) => i.key === key)!.code;

describe("ポータルの認証", () => {
  beforeEach(async () => {
    seed = await resetDb();
  });
  after(async () => {
    await closeDb();
  });

  describe("招待コードの発行", () => {
    it("スタッフが個人ごとに発行する。推測しにくい 8 文字で、有効期限は 90 日", async () => {
      const staff = await staffOf(seed);
      const now = new Date("2026-11-06T10:00:00+09:00");
      const a = await issueInvite(staff, { personId: seed.get("person:tanaka:grandchild") }, { now });
      const b = await issueInvite(staff, { personId: seed.get("person:tanaka:grandchild") }, { now });
      for (const inv of [a, b]) {
        assert.equal(inv.code.length, 8);
        for (const c of inv.code) assert.ok(INVITE_ALPHABET.includes(c), `使わない文字: ${c}`);
        assert.equal(inv.expiresAt.getTime() - now.getTime(), 90 * 24 * 60 * 60 * 1000);
        assert.match(inv.url, /\/portal\/register\?code=[A-Z0-9]{8}$/);
      }
      assert.notEqual(a.code, b.code);
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "portal.invite.issue"));
      assert.equal(logs.length, 2);
    });

    it("ポータルの操作者は発行できない。故人、離檀した世帯の人には発行できない", async () => {
      const staff = await staffOf(seed);
      await rejects(issueInvite(await portalOf(seed, "portal:tanaka_contact"), { personId: seed.get("person:tanaka:grandchild") }), "forbidden");
      await rejects(issueInvite(staff, { personId: seed.get("person:tanaka:wife") }), "invalid", /故人/);
      await rejects(issueInvite(staff, { personId: seed.get("person:kato:head") }), "invalid", /離檀・転出/);
      await rejects(issueInvite(staff, { personId: "not-a-uuid" }), "not_found");
    });
  });

  describe("招待コードの確認と登録", () => {
    it("手で入力したコードは、小文字・ハイフン・全角・空白があっても通る", () => {
      assert.equal(normalizeInviteCode("tnkm-sk26"), "TNKMSK26");
      assert.equal(normalizeInviteCode(" ＴＮＫＭ－ＳＫ２６ "), "TNKMSK26");
      assert.equal(normalizeInviteCode("TNKM SK26"), "TNKMSK26");
      assert.equal(formatInviteCode("TNKMSK26"), "TNKM-SK26");
    });

    it("登録の画面で、コードの持ち主の名前を確かめられる", async () => {
      const r = await lookupInvite("tnkm-sk26");
      assert.equal(r.status, "ok");
      if (r.status === "ok") {
        assert.equal(r.personName, "田中 美咲");
        assert.equal(r.householdName, "田中家");
        assert.equal(r.hasAccount, false);
      }
      assert.equal((await lookupInvite(SEED_EXPIRED_INVITE.code)).status, "expired");
      assert.equal((await lookupInvite("ZZZZ-ZZZZ")).status, "not_found");
      assert.equal((await lookupInvite("")).status, "not_found");
    });

    it("コードとメールアドレスで登録すると、アカウントができてコードは使用済みになる。家族の権限は初期値オフ", async () => {
      const r = await registerWithInvite({ code: "tnkm-sk26", email: " Misaki.Tanaka@Example.com " });
      assert.equal(r.replaced, false);
      assert.equal(r.account.displayName, "田中 美咲");
      assert.equal(r.account.email, "misaki.tanaka@example.com");
      assert.equal(r.account.canViewHousehold, false);
      assert.equal(r.account.canApplyMemorial, false);
      assert.equal(r.account.personId, seed.get("person:tanaka:son_wife"));
      const [inv] = await db.select().from(portalInvites).where(eq(portalInvites.code, "TNKMSK26"));
      assert.ok(inv.usedAt);
      assert.equal((await lookupInvite("TNKMSK26")).status, "used");
      const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "portal.account.register"));
      assert.equal(log.channel, "portal");
    });

    it("使用済みの招待コードを拒否する", async () => {
      await registerWithInvite({ code: inviteCode("portal_invite:yamada_wife"), email: "yumi.yamada@example.com" });
      await rejects(
        registerWithInvite({ code: inviteCode("portal_invite:yamada_wife"), email: "yumi2.yamada@example.com" }),
        "conflict",
        /すでに使われています/,
      );
      const accounts = await db.select().from(portalAccounts).where(eq(portalAccounts.personId, seed.get("person:yamada:wife")));
      assert.equal(accounts.length, 1);
      assert.equal(accounts[0].email, "yumi.yamada@example.com");
    });

    it("期限切れの招待コード、知らないコードを拒否する", async () => {
      await rejects(registerWithInvite({ code: SEED_EXPIRED_INVITE.code, email: "ito@example.com" }), "expired", /有効期限/);
      await rejects(registerWithInvite({ code: "ZZZZZZZZ", email: "x@example.com" }), "not_found");
      await rejects(registerWithInvite({ code: "abc", email: "x@example.com" }), "not_found");
      // 有効期限のちょうどその時刻も期限切れ
      const staff = await staffOf(seed);
      const now = new Date("2026-11-06T10:00:00+09:00");
      const inv = await issueInvite(staff, { personId: seed.get("person:tanaka:grandchild"), expiresInDays: 1 }, { now });
      await rejects(registerWithInvite({ code: inv.code, email: "hina@example.com" }, { now: inv.expiresAt }), "expired");
      const ok = await registerWithInvite({ code: inv.code, email: "hina@example.com" }, { now: new Date(inv.expiresAt.getTime() - 1000) });
      assert.equal(ok.account.displayName, "田中 陽菜");
    });

    it("ほかの方が登録したメールアドレス、形の正しくないメールアドレスを拒否し、そのときコードは使用済みにならない", async () => {
      const code = inviteCode("portal_invite:tanaka_son_wife");
      await rejects(registerWithInvite({ code, email: "kenichi.tanaka@example.com" }), "conflict", /ほかの方/);
      await rejects(registerWithInvite({ code, email: "not-an-email" }), "invalid");
      const [inv] = await db.select().from(portalInvites).where(eq(portalInvites.code, code));
      assert.equal(inv.usedAt, null);
    });

    it("発行のあとで故人になった人、離檀した世帯の人のコードは使えない", async () => {
      const staff = await staffOf(seed);
      await updatePerson(staff, seed.get("person:yamada:daughter"), {
        familyName: "山田",
        givenName: "さくら",
        birthDate: "1995-04-02",
        isDeceased: true,
        deathDate: "2026-11-01",
      });
      const daughterCode = inviteCode("portal_invite:yamada_daughter");
      assert.equal((await lookupInvite(daughterCode)).status, "unavailable");
      await rejects(registerWithInvite({ code: daughterCode, email: "sakura@example.com" }), "forbidden");
      const [inv] = await db.select().from(portalInvites).where(eq(portalInvites.code, daughterCode));
      assert.equal(inv.usedAt, null);
      const sato = await getHouseholdBasics(seed.get("household:sato"));
      assert.ok(sato);
      await updateHousehold(staff, sato.id, { name: "佐藤家", status: "left" });
      assert.equal((await lookupInvite(inviteCode("portal_invite:sato_head"))).status, "unavailable");
      await rejects(registerWithInvite({ code: inviteCode("portal_invite:sato_head"), email: "sato@example.com" }), "forbidden");
    });

    it("アカウントがある人に新しい招待コードを発行して使うと、メールアドレスを置き換える（家族の権限はそのまま）", async () => {
      const staff = await staffOf(seed);
      const inv = await issueInvite(staff, { personId: seed.get("person:tanaka:head") });
      assert.equal((await lookupInvite(inv.code)).status, "ok");
      const r = await registerWithInvite({ code: inv.code, email: "ichiro.new@example.com" });
      assert.equal(r.replaced, true);
      assert.equal(r.account.id, seed.get("portal:tanaka_head"));
      assert.equal(r.account.email, "ichiro.new@example.com");
      assert.equal(r.account.canViewHousehold, true);
      assert.equal(await requestLoginLink("ichiro.tanaka@example.com"), null);
      assert.ok(await requestLoginLink("ichiro.new@example.com"));
    });
  });

  describe("マジックリンク", () => {
    it("メールアドレスから 15 分有効のリンクを作る。DB にはトークンのハッシュだけを保存する", async () => {
      const now = new Date("2026-11-06T10:00:00+09:00");
      const link = await requestLoginLink("Kenichi.Tanaka@example.com", { now });
      assert.ok(link);
      assert.equal(link.expiresAt.getTime() - now.getTime(), 15 * 60 * 1000);
      assert.ok(link.token.length >= 40);
      const rows = await db.select().from(portalLoginTokens);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].tokenHash, hashLoginToken(link.token));
      assert.notEqual(rows[0].tokenHash, link.token);
      assert.ok(!JSON.stringify(rows).includes(link.token));
    });

    it("登録のないメールアドレスには作らない（画面では同じ案内を出す）。形の正しくないものは invalid", async () => {
      assert.equal(await requestLoginLink("nobody@example.com"), null);
      await rejects(requestLoginLink("abc"), "invalid");
    });

    it("リンクを使うとログインでき、最後のログインの日時が変わる", async () => {
      const now = new Date("2026-11-06T10:00:00+09:00");
      const link = await requestLoginLink("kenichi.tanaka@example.com", { now });
      const account = await consumeLoginLink(link!.token, { now: new Date(now.getTime() + 14 * 60 * 1000) });
      assert.equal(account.id, seed.get("portal:tanaka_contact"));
      const after = await getPortalAccount(account.id);
      assert.equal(after?.lastLoginAt?.getTime(), now.getTime() + 14 * 60 * 1000);
      const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "portal.login"), eq(auditLogs.channel, "portal")));
      assert.equal(logs.length, 1);
    });

    it("使用済みのリンクを拒否する", async () => {
      const link = await requestLoginLink("kenichi.tanaka@example.com");
      await consumeLoginLink(link!.token);
      await rejects(consumeLoginLink(link!.token), "conflict", /すでに使われています/);
    });

    it("期限切れのリンクを拒否する（15 分ちょうども期限切れ）", async () => {
      const now = new Date("2026-11-06T10:00:00+09:00");
      const link = await requestLoginLink("kenichi.tanaka@example.com", { now });
      await rejects(consumeLoginLink(link!.token, { now: new Date(now.getTime() + 15 * 60 * 1000) }), "expired", /有効期限/);
      await rejects(consumeLoginLink(link!.token, { now: new Date(now.getTime() + 60 * 60 * 1000) }), "expired");
      // 期限切れで拒否したリンクは、使用済みにならない（が、期限は戻らない）
      const [row] = await db.select().from(portalLoginTokens);
      assert.equal(row.usedAt, null);
    });

    it("知らないトークン、空のトークンを拒否する", async () => {
      await rejects(consumeLoginLink("x".repeat(43)), "invalid");
      await rejects(consumeLoginLink(""), "invalid");
    });

    it("世帯が離檀・転出したら、リンクは作れず、作ったリンクも使えない", async () => {
      const link = await requestLoginLink("ken.yamada@example.com");
      const staff = await staffOf(seed);
      await updateHousehold(staff, seed.get("household:yamada"), { name: "山田家", status: "moved" });
      await rejects(consumeLoginLink(link!.token), "forbidden");
      assert.equal(await requestLoginLink("ken.yamada@example.com"), null);
      assert.equal(await getPortalAccount(seed.get("portal:yamada_head")), null);
    });
  });

  describe("ログインの状態", () => {
    it("30 日間有効。31 日目には読めない", () => {
      const now = new Date("2026-11-06T10:00:00+09:00");
      const token = createPortalSessionToken("acc-1", now);
      assert.equal(PORTAL_SESSION_SECONDS, 30 * 24 * 60 * 60);
      assert.equal(readPortalSessionToken(token, new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000)), "acc-1");
      assert.equal(readPortalSessionToken(token, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)), null);
    });

    it("スタッフのトークンや、書き換えたトークンは、ポータルのログインとして読まない", () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      assert.equal(readPortalSessionToken(signToken({ sub: "staff-1", exp, kind: "staff" })), null);
      const token = createPortalSessionToken("acc-1");
      const [body, sig] = token.split(".");
      const forged = Buffer.from(JSON.stringify({ sub: "acc-2", exp, kind: "portal" })).toString("base64url");
      assert.equal(readPortalSessionToken(`${forged}.${sig}`), null);
      assert.equal(readPortalSessionToken(`${body}.x${sig}`), null);
      assert.equal(readPortalSessionToken(undefined), null);
    });
  });
});
