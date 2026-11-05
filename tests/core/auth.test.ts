import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb } from "@/db/client";
import { DEV_PASSWORD } from "@/db/seed/core";
import { authenticateStaff, hashPassword, verifyPassword } from "@/domain/core";
import { signToken, verifyToken } from "@/lib/signed-token";
import { resetDb } from "../helpers/db";

describe("パスワード", () => {
  it("ハッシュにしたパスワードを確かめられる", async () => {
    const h = await hashPassword("合言葉");
    assert.match(h, /^scrypt\$/);
    assert.equal(await verifyPassword("合言葉", h), true);
    assert.equal(await verifyPassword("違う", h), false);
    assert.equal(await verifyPassword("合言葉", "壊れた値"), false);
  });
});

describe("署名つきのトークン", () => {
  const now = new Date("2026-11-05T00:00:00Z");
  const exp = Math.floor(now.getTime() / 1000) + 60;
  it("署名と種類と期限を確かめる", () => {
    const t = signToken({ sub: "a", exp, kind: "staff" }, "secret-secret-secret");
    assert.equal(verifyToken(t, "staff", now, "secret-secret-secret")?.sub, "a");
    assert.equal(verifyToken(t, "portal", now, "secret-secret-secret"), null, "種類が違う");
    assert.equal(verifyToken(t, "staff", now, "other-secret-secret"), null, "鍵が違う");
    assert.equal(verifyToken(t, "staff", new Date(now.getTime() + 61_000), "secret-secret-secret"), null, "期限切れ");
  });
  it("書き換えたトークンを拒否する", () => {
    const t = signToken({ sub: "a", exp, kind: "staff" }, "secret-secret-secret");
    const [, sig] = t.split(".");
    const forged = `${Buffer.from(JSON.stringify({ sub: "b", exp, kind: "staff" })).toString("base64url")}.${sig}`;
    assert.equal(verifyToken(forged, "staff", now, "secret-secret-secret"), null);
    assert.equal(verifyToken(undefined, "staff", now, "secret-secret-secret"), null);
  });
});

describe("スタッフのログイン", () => {
  before(async () => {
    await resetDb();
  });
  after(async () => {
    await closeDb();
  });
  it("シードのスタッフはメールとパスワードでログインできる（メールの大文字と空白は無視する）", async () => {
    const s = await authenticateStaff(" JUSHOKU@example.com ", DEV_PASSWORD);
    assert.equal(s?.roleTitle, "住職");
    assert.equal(s?.isOfficiant, true);
  });
  it("パスワードが違えばログインできない", async () => {
    assert.equal(await authenticateStaff("jushoku@example.com", "wrong"), null);
  });
  it("メールを持たないスタッフ（アルバイト）はログインできない", async () => {
    assert.equal(await authenticateStaff("", DEV_PASSWORD), null);
  });
});
