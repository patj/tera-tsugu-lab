// お寺のアプリ: 1 件ずつの共有（sharing: "perDoc"）。spec.md §7「1 件ずつの共有」
// アプリ単位の共有を外側のスイッチにし、スタッフに見えるのは、共有中で、かつ印の付いた文書だけ
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { and, desc, eq, like } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { appDocuments, auditLogs } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { getStaffById, staffActor, type Actor } from "@/domain/core";
import {
  countMySharedAppDocuments,
  createAppDocument,
  listMyAppDocuments,
  listSharedAppDocuments,
  listSharedAppUsers,
  setAppDocumentShared,
  setAppSharing,
  setAppsForTesting,
  startAppUser,
  toAppUserActor,
  updateAppDocument,
} from "@/domain/apps";
import { resetDb } from "../helpers/db";
import { rejects } from "../portal/helpers";
import { DIARY, FORTUNE, JOURNAL, TEST_APPS } from "./fixture";

let seed: SeedContext;
let staff: Actor;
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
  const u = await startAppUser(seed.templeId, "はな");
  hanaId = u.id;
  hana = toAppUserActor(u);
  taro = toAppUserActor(await startAppUser(seed.templeId, "たろう"));
});

const texts = (docs: { data: unknown }[]) => docs.map((d) => (d.data as { text: string }).text);

describe("1 件ずつの共有", () => {
  it("新しい文書は共有しない。印を付けた文書だけがスタッフに見え、件数と最後の更新も印の付いたものだけ", async () => {
    const a = await createAppDocument(hana, JOURNAL, { text: "見せない日" });
    assert.equal(a.shared, false);
    const b = await createAppDocument(hana, JOURNAL, { text: "見せる日" }, { shared: true });
    assert.equal(b.shared, true);
    await setAppSharing(hana, JOURNAL, true);

    const v = await listSharedAppDocuments(staff, JOURNAL, hanaId);
    assert.deepEqual({ shared: v.shared, perDoc: v.perDoc, texts: texts(v.docs) }, { shared: true, perDoc: true, texts: ["見せる日"] });

    // 印のない文書をあとから書き直しても、一覧の「最後の更新」は変わらない
    await new Promise((r) => setTimeout(r, 10));
    await updateAppDocument(hana, JOURNAL, a.id, { text: "見せない日（夜中に書き直した）" });
    const [u] = await listSharedAppUsers(staff);
    assert.deepEqual({ perDoc: u.perDoc, n: u.docCount }, { perDoc: true, n: 1 });
    assert.equal(u.lastUpdatedAt?.toISOString(), b.updatedAt);
  });

  it("印のない文書は、スタッフの閲覧で読み出さない（復号もしない）", async () => {
    const a = await createAppDocument(hana, JOURNAL, { text: "見せない日" });
    await createAppDocument(hana, JOURNAL, { text: "見せる日" }, { shared: true });
    await setAppSharing(hana, JOURNAL, true);
    // 印のない文書の暗号文を壊す。読み出して復号すれば失敗する
    await db.update(appDocuments).set({ ciphertext: "v1:broken:broken:broken" }).where(eq(appDocuments.id, a.id));
    assert.deepEqual(texts((await listSharedAppDocuments(staff, JOURNAL, hanaId)).docs), ["見せる日"]);
  });

  it("印を付ける・外すと、すぐに見え方が変わる。update は印を変えない。印を変えても更新の日時は変わらない", async () => {
    await setAppSharing(hana, JOURNAL, true);
    const a = await createAppDocument(hana, JOURNAL, { text: "ある日" });
    assert.equal((await listSharedAppDocuments(staff, JOURNAL, hanaId)).docs.length, 0);

    const marked = await setAppDocumentShared(hana, JOURNAL, a.id, true);
    assert.equal(marked.shared, true);
    assert.equal(marked.updatedAt, a.updatedAt);
    assert.deepEqual(texts((await listSharedAppDocuments(staff, JOURNAL, hanaId)).docs), ["ある日"]);

    const updated = await updateAppDocument(hana, JOURNAL, a.id, { text: "書き直した日" });
    assert.equal(updated.shared, true);
    assert.deepEqual(texts((await listSharedAppDocuments(staff, JOURNAL, hanaId)).docs), ["書き直した日"]);

    await setAppDocumentShared(hana, JOURNAL, a.id, false);
    assert.equal((await listSharedAppDocuments(staff, JOURNAL, hanaId)).docs.length, 0);
    assert.equal((await listMyAppDocuments(hana, JOURNAL))[0].shared, false);
  });

  it("アプリ単位でやめると、印があっても見えない。共有し直すと、印の付いた過去の文書がまた見える。印はアプリ単位で共有する前にも付けられる", async () => {
    await createAppDocument(hana, JOURNAL, { text: "共有する前に選んだ日" }, { shared: true });
    await createAppDocument(hana, JOURNAL, { text: "選ばなかった日" });
    assert.equal((await listSharedAppDocuments(staff, JOURNAL, hanaId)).docs.length, 0);
    assert.equal((await listSharedAppUsers(staff)).length, 0);

    await setAppSharing(hana, JOURNAL, true);
    assert.deepEqual(texts((await listSharedAppDocuments(staff, JOURNAL, hanaId)).docs), ["共有する前に選んだ日"]);

    await setAppSharing(hana, JOURNAL, false);
    assert.equal((await listSharedAppDocuments(staff, JOURNAL, hanaId)).docs.length, 0);
    assert.equal((await listMyAppDocuments(hana, JOURNAL)).filter((d) => d.shared).length, 1);

    await setAppSharing(hana, JOURNAL, true);
    assert.deepEqual(texts((await listSharedAppDocuments(staff, JOURNAL, hanaId)).docs), ["共有する前に選んだ日"]);
  });

  it("アプリ単位で共有していて、印が 0 件の利用者も一覧に出る（見える文書は 0 件）", async () => {
    await createAppDocument(hana, JOURNAL, { text: "選ばなかった日" });
    await setAppSharing(hana, JOURNAL, true);
    const users = await listSharedAppUsers(staff);
    assert.deepEqual(
      users.map((u) => ({ appId: u.appId, n: u.docCount, last: u.lastUpdatedAt })),
      [{ appId: JOURNAL, n: 0, last: null }],
    );
  });

  it("印の付いた件数を本人が数えられる", async () => {
    await createAppDocument(hana, JOURNAL, { text: "1" }, { shared: true });
    await createAppDocument(hana, JOURNAL, { text: "2" });
    await createAppDocument(taro, JOURNAL, { text: "3" }, { shared: true });
    assert.equal(await countMySharedAppDocuments(hana, JOURNAL), 1);
    await rejects(countMySharedAppDocuments(hana, DIARY), "invalid");
  });

  it("他人の文書の印は変えられない。ないもの、別のアプリの ID でも変えられない", async () => {
    const a = await createAppDocument(hana, JOURNAL, { text: "はなの日" });
    await rejects(setAppDocumentShared(taro, JOURNAL, a.id, true), "not_found");
    await rejects(setAppDocumentShared(hana, JOURNAL, "not-a-uuid", true), "not_found");
    await rejects(setAppDocumentShared(hana, JOURNAL, crypto.randomUUID(), true), "not_found");
    assert.equal((await listMyAppDocuments(hana, JOURNAL))[0].shared, false);
  });

  it("sharing: true や false のアプリでは、印を使えない", async () => {
    const d = await createAppDocument(hana, DIARY, { text: "日記" });
    assert.equal(d.shared, false);
    await rejects(createAppDocument(hana, DIARY, { text: "x" }, { shared: true }), "invalid", /1 件ずつの共有に対応していません/);
    await rejects(createAppDocument(hana, FORTUNE, "大吉", { shared: true }), "invalid", /1 件ずつの共有に対応していません/);
    await rejects(setAppDocumentShared(hana, DIARY, d.id, true), "invalid", /1 件ずつの共有に対応していません/);
    await rejects(createAppDocument(hana, JOURNAL, { text: "x" }, { shared: "yes" as unknown as boolean }), "invalid");
    // shared: false を明示するのは、どのアプリでもよい
    assert.equal((await createAppDocument(hana, DIARY, { text: "y" }, { shared: false })).shared, false);
  });

  it("sharing: true のアプリを \"perDoc\" に変えると、それまでの文書は印がないので見えない", async () => {
    await setAppSharing(hana, DIARY, true);
    await createAppDocument(hana, DIARY, { text: "アプリ単位のころ" });
    assert.equal((await listSharedAppDocuments(staff, DIARY, hanaId)).docs.length, 1);
    setAppsForTesting([{ manifest: { ...TEST_APPS[0].manifest, sharing: "perDoc" } }, ...TEST_APPS.slice(1)]);
    try {
      assert.equal((await listSharedAppDocuments(staff, DIARY, hanaId)).docs.length, 0);
      assert.equal((await listSharedAppUsers(staff))[0].docCount, 0);
    } finally {
      setAppsForTesting(TEST_APPS);
    }
  });
});

describe("1 件ずつの共有: 監査ログと操作者", () => {
  it("印の変更（作るときを含む）を、変わったときだけ残す。本文とニックネームは残さない", async () => {
    const a = await createAppDocument(hana, JOURNAL, { text: "とても秘密の日" }, { shared: true });
    await createAppDocument(hana, JOURNAL, { text: "秘密の日 2" });
    await setAppDocumentShared(hana, JOURNAL, a.id, true); // 変わらない
    await setAppDocumentShared(hana, JOURNAL, a.id, false);
    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "apps.documents.share")))
      .orderBy(desc(auditLogs.createdAt));
    assert.equal(logs.length, 2);
    assert.ok(logs.every((l) => l.target?.endsWith(`/doc:${a.id}`) && l.channel === "apps"));
    assert.deepEqual(
      logs.map((l) => l.summary),
      ["この文書の共有をやめる", "この文書をお寺と共有する"],
    );
    await setAppSharing(hana, JOURNAL, true);
    await listSharedAppDocuments(staff, JOURNAL, hanaId);
    for (const l of await db.select().from(auditLogs).where(like(auditLogs.action, "apps.%"))) {
      const text = JSON.stringify(l);
      assert.ok(!text.includes("秘密") && !text.includes("はな"), text);
    }
  });

  it("閲覧の監査ログの件数は、渡した件数", async () => {
    await createAppDocument(hana, JOURNAL, { text: "1" }, { shared: true });
    await createAppDocument(hana, JOURNAL, { text: "2" });
    await setAppSharing(hana, JOURNAL, true);
    await listSharedAppDocuments(staff, JOURNAL, hanaId);
    const [v] = await db.select().from(auditLogs).where(eq(auditLogs.action, "apps.documents.view")).orderBy(desc(auditLogs.createdAt)).limit(1);
    assert.equal(v.summary, "1 件を表示");
  });

  it("MCP の操作者とスタッフは、印を変えられず、件数も数えられない", async () => {
    const a = await createAppDocument(hana, JOURNAL, { text: "x" });
    const mcpUser = { ...hana, channel: "mcp" as const };
    await rejects(setAppDocumentShared(mcpUser, JOURNAL, a.id, true), "forbidden", /MCP/);
    await rejects(createAppDocument(mcpUser, JOURNAL, {}, { shared: true }), "forbidden", /MCP/);
    await rejects(countMySharedAppDocuments(mcpUser, JOURNAL), "forbidden", /MCP/);
    await rejects(setAppDocumentShared(staff, JOURNAL, a.id, true), "forbidden");
  });
});
