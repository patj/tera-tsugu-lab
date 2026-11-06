// お寺のアプリ: 文書の読み書き、お寺との共有、監査ログ、操作者の制限（spec.md §7）
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { desc, eq, like } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { appConsents, appDocuments, auditLogs } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { getStaffById, staffActor, type Actor } from "@/domain/core";
import {
  countMyAppDocuments,
  createAppDocument,
  deleteAllAppDocuments,
  deleteAppDocument,
  getAppSharing,
  listMyAppDocuments,
  listMyAppSharingHistory,
  listSharedAppDocuments,
  listSharedAppUsers,
  setAppSharing,
  setAppsForTesting,
  startAppUser,
  toAppUserActor,
  updateAppDocument,
} from "@/domain/apps";
import { APP_DOCUMENT_MAX_BYTES } from "@/apps-sdk";
import { resetDb } from "../helpers/db";
import { rejects } from "../portal/helpers";
import { DIARY, FORTUNE, TEST_APPS } from "./fixture";

let seed: SeedContext;
let staff: Actor;
let mcpStaff: Actor;
let hana: Actor;
let hanaId: string;
let taro: Actor;

before(() => setAppsForTesting(TEST_APPS));
after(async () => {
  setAppsForTesting(null);
  await closeDb();
});

beforeEach(async () => {
  seed = await resetDb();
  const s = await getStaffById(seed.get("staff:jushoku"));
  assert.ok(s);
  staff = staffActor(s, "web");
  mcpStaff = staffActor(s, "mcp");
  const u = await startAppUser(seed.templeId, "  はな  ");
  assert.equal(u.nickname, "はな");
  hanaId = u.id;
  hana = toAppUserActor(u);
  taro = toAppUserActor(await startAppUser(seed.templeId, "たろう"));
});

async function lastAudit(action: string) {
  const [a] = await db.select().from(auditLogs).where(eq(auditLogs.action, action)).orderBy(desc(auditLogs.createdAt)).limit(1);
  return a;
}

describe("文書", () => {
  it("自由な形の JSON を作る・読む・直す・消す。DB には暗号文だけが残る", async () => {
    const a = await createAppDocument(hana, DIARY, { title: "朝", body: "お寺の庭を歩いた", tags: ["散歩"], mood: 4 });
    const b = await createAppDocument(hana, FORTUNE, "大吉");
    assert.deepEqual(a.data, { title: "朝", body: "お寺の庭を歩いた", tags: ["散歩"], mood: 4 });
    assert.equal(b.data, "大吉");
    const [row] = await db.select().from(appDocuments).where(eq(appDocuments.id, a.id));
    assert.ok(!row.ciphertext.includes("庭"));

    const updated = await updateAppDocument(hana, DIARY, a.id, { title: "朝", body: "書き直した" });
    assert.deepEqual(updated.data, { title: "朝", body: "書き直した" });
    assert.ok(updated.updatedAt >= a.updatedAt);
    assert.deepEqual(await countMyAppDocuments(hana), { [DIARY]: 1, [FORTUNE]: 1 });

    await deleteAppDocument(hana, DIARY, a.id);
    assert.equal((await listMyAppDocuments(hana, DIARY)).length, 0);
    assert.equal((await listMyAppDocuments(hana, FORTUNE)).length, 1);
  });

  it("一覧は新しい順", async () => {
    await createAppDocument(hana, DIARY, { n: 1 });
    await createAppDocument(hana, DIARY, { n: 2 });
    assert.deepEqual((await listMyAppDocuments(hana, DIARY)).map((d) => (d.data as { n: number }).n), [2, 1]);
  });

  it("他人の文書は、読めず、直せず、消せない。別のアプリの ID でも触れない", async () => {
    const d = await createAppDocument(hana, DIARY, { text: "はなの日記" });
    assert.equal((await listMyAppDocuments(taro, DIARY)).length, 0);
    await rejects(updateAppDocument(taro, DIARY, d.id, { text: "x" }), "not_found");
    await rejects(deleteAppDocument(taro, DIARY, d.id), "not_found");
    await rejects(updateAppDocument(hana, FORTUNE, d.id, { text: "x" }), "not_found");
    await rejects(deleteAppDocument(hana, DIARY, "not-a-uuid"), "not_found");
    assert.deepEqual((await listMyAppDocuments(hana, DIARY))[0].data, { text: "はなの日記" });
  });

  it("保存できないもの: 空、大きすぎるもの、ないアプリ（エラーに本文を入れない）", async () => {
    await rejects(createAppDocument(hana, DIARY, undefined), "invalid");
    await assert.rejects(createAppDocument(hana, DIARY, { text: "秘密".repeat(APP_DOCUMENT_MAX_BYTES) }), (e: Error) => {
      assert.match(e.message, /KB/);
      assert.ok(!e.message.includes("秘密"));
      return true;
    });
    await rejects(createAppDocument(hana, "no-such-app", {}), "not_found");
  });
});

describe("すべて消す・件数の上限", () => {
  it("すべて消すのは、自分の、そのアプリの文書だけ", async () => {
    await createAppDocument(hana, DIARY, { n: 1 });
    await createAppDocument(hana, DIARY, { n: 2 });
    await createAppDocument(hana, FORTUNE, "大吉");
    await createAppDocument(taro, DIARY, { n: 3 });
    assert.equal(await deleteAllAppDocuments(hana, DIARY), 2);
    assert.equal((await listMyAppDocuments(hana, DIARY)).length, 0);
    assert.equal((await listMyAppDocuments(hana, FORTUNE)).length, 1);
    assert.equal((await listMyAppDocuments(taro, DIARY)).length, 1);
    await rejects(deleteAllAppDocuments(staff, DIARY), "forbidden");
  });

  it("件数の上限は manifest の storage.maxDocs で決まる", async () => {
    setAppsForTesting([{ manifest: { ...TEST_APPS[0].manifest, storage: { maxDocs: 2 } } }, TEST_APPS[1]]);
    try {
      await createAppDocument(hana, DIARY, { n: 1 });
      await createAppDocument(hana, DIARY, { n: 2 });
      await rejects(createAppDocument(hana, DIARY, { n: 3 }), "conflict", /2 件まで/);
    } finally {
      setAppsForTesting(TEST_APPS);
    }
  });
});

describe("お寺との共有", () => {
  it("共有していないと、スタッフには見えない（閲覧の試みは監査ログに残る）", async () => {
    await createAppDocument(hana, DIARY, { text: "ひみつ" });
    assert.equal((await listSharedAppUsers(staff)).length, 0);
    const v = await listSharedAppDocuments(staff, DIARY, hanaId);
    assert.deepEqual({ shared: v.shared, n: v.docs.length }, { shared: false, n: 0 });
    assert.equal((await lastAudit("apps.documents.view")).result, "not_shared");
  });

  it("共有すると見え、やめるとすぐに見えなくなり、共有し直すと過去の文書も見える。設定の履歴が残る", async () => {
    await createAppDocument(hana, DIARY, { text: "共有する前" });
    assert.equal(await getAppSharing(hana, DIARY), false);
    assert.deepEqual(await setAppSharing(hana, DIARY, true), { changed: true });
    assert.deepEqual(await setAppSharing(hana, DIARY, true), { changed: false });
    await createAppDocument(hana, DIARY, { text: "共有した後" });

    const users = await listSharedAppUsers(staff);
    assert.equal(users.length, 1);
    assert.deepEqual({ nickname: users[0].nickname, appId: users[0].appId, n: users[0].docCount }, { nickname: "はな", appId: DIARY, n: 2 });
    const v = await listSharedAppDocuments(staff, DIARY, hanaId);
    assert.deepEqual(v.docs.map((d) => (d.data as { text: string }).text), ["共有した後", "共有する前"]);

    await setAppSharing(hana, DIARY, false);
    assert.equal((await listSharedAppUsers(staff)).length, 0);
    assert.equal((await listSharedAppDocuments(staff, DIARY, hanaId)).docs.length, 0);

    await setAppSharing(hana, DIARY, true);
    assert.equal((await listSharedAppDocuments(staff, DIARY, hanaId)).docs.length, 2);
    assert.deepEqual((await listMyAppSharingHistory(hana, DIARY)).map((h) => h.shared), [true, false, true]);
    assert.equal((await db.select().from(appConsents).where(eq(appConsents.userId, hanaId))).length, 3);
  });

  it("共有に対応していないアプリは、共有を選べず、スタッフにも見えない", async () => {
    await createAppDocument(hana, FORTUNE, "大吉");
    await rejects(setAppSharing(hana, FORTUNE, true), "invalid", /共有に対応していません/);
    await rejects(getAppSharing(hana, FORTUNE), "invalid");
    assert.equal((await listSharedAppDocuments(staff, FORTUNE, hanaId)).shared, false);
  });

  it("アプリが共有に対応しなくなったら、以前の共有の設定があっても見えない", async () => {
    await setAppSharing(hana, DIARY, true);
    await createAppDocument(hana, DIARY, { text: "x" });
    setAppsForTesting([{ manifest: { ...TEST_APPS[0].manifest, sharing: false } }, TEST_APPS[1]]);
    try {
      assert.equal((await listSharedAppUsers(staff)).length, 0);
      assert.equal((await listSharedAppDocuments(staff, DIARY, hanaId)).docs.length, 0);
    } finally {
      setAppsForTesting(TEST_APPS);
    }
  });
});

describe("監査ログ", () => {
  it("共有の設定の変更と、文書の閲覧を残す。本文とニックネームは残さない", async () => {
    await setAppSharing(hana, DIARY, true);
    await createAppDocument(hana, DIARY, { text: "とても秘密の言葉" });
    await listSharedAppDocuments(staff, DIARY, hanaId);

    const set = await lastAudit("apps.sharing.set");
    assert.equal(set.channel, "apps");
    assert.match(set.actor, /^apps:利用者 [0-9a-f]{8}$/);
    assert.equal((await lastAudit("apps.documents.view")).result, "ok");
    for (const l of await db.select().from(auditLogs).where(like(auditLogs.action, "apps.%"))) {
      const text = JSON.stringify(l);
      assert.ok(!text.includes("秘密") && !text.includes("はな"), text);
    }
  });
});

describe("操作者の制限", () => {
  it("MCP の操作者は、すべての関数で拒否する", async () => {
    await setAppSharing(hana, DIARY, true);
    const mcpUser = { ...hana, channel: "mcp" as const };
    await rejects(listSharedAppUsers(mcpStaff), "forbidden", /MCP/);
    await rejects(listSharedAppDocuments(mcpStaff, DIARY, hanaId), "forbidden", /MCP/);
    await rejects(listMyAppDocuments(mcpUser, DIARY), "forbidden", /MCP/);
    await rejects(createAppDocument(mcpUser, DIARY, {}), "forbidden", /MCP/);
    await rejects(setAppSharing(mcpUser, DIARY, false), "forbidden", /MCP/);
  });

  it("利用者はスタッフの関数を使えず、スタッフは利用者の関数を使えない", async () => {
    await rejects(listSharedAppUsers(hana), "forbidden");
    await rejects(listSharedAppDocuments(hana, DIARY, hanaId), "forbidden");
    await rejects(createAppDocument(staff, DIARY, {}), "forbidden");
    await rejects(listMyAppDocuments(staff, DIARY), "forbidden");
    await rejects(setAppSharing(staff, DIARY, true), "forbidden");
  });

  it("MCP のサーバーのコードは、お寺のアプリのドメイン層とテーブルを使わない", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(n)) files.push(p);
      }
    };
    walk(path.resolve(__dirname, "../../src/mcp"));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      assert.ok(!/domain\/apps|appDocuments|appUsers|appConsents|app_documents/.test(src), f);
    }
  });
});
