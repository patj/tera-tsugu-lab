// ケアの記録、同意、アラート、監査ログ、MCP の拒否（spec.md §7）
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { desc, eq, like } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { auditLogs, careConsents, careEntries } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { getStaffById, staffActor, type Actor } from "@/domain/core";
import {
  careDataFromForm,
  countUnseenCareAlerts,
  getCareConsent,
  listCareAlerts,
  listMyCareConsentHistory,
  listMyCareEntries,
  listSharedCareEntries,
  listSharedCareSubjects,
  markCareAlertSeen,
  saveCareEntry,
  setCareConsent,
  setCareToolsForTesting,
  startCareSubject,
  toCareActor,
} from "@/domain/care";
import { resetDb } from "../helpers/db";
import { rejects } from "../portal/helpers";
import { TEST_TOOLS, TEST_TOOL_ID as T, testManifest } from "./fixture";

let seed: SeedContext;
let staff: Actor;
let mcpStaff: Actor;
let hana: Actor;
let hanaId: string;

before(() => setCareToolsForTesting(TEST_TOOLS));
after(async () => {
  setCareToolsForTesting(null);
  await closeDb();
});

beforeEach(async () => {
  seed = await resetDb();
  const s = await getStaffById(seed.get("staff:jushoku"));
  assert.ok(s);
  staff = staffActor(s, "web");
  mcpStaff = staffActor(s, "mcp");
  const subject = await startCareSubject(seed.templeId, "  はな  ");
  assert.equal(subject.nickname, "はな");
  hanaId = subject.id;
  hana = toCareActor(subject);
});

async function lastAudit(action: string) {
  const [a] = await db.select().from(auditLogs).where(eq(auditLogs.action, action)).orderBy(desc(auditLogs.createdAt)).limit(1);
  return a;
}

describe("記録", () => {
  it("暗号化して保存し、本人だけが読める。DB に平文は残らない", async () => {
    const r = await saveCareEntry(hana, T, { mood: 4, note: "お寺の庭がきれいだった" });
    assert.equal(r.crisis, false);
    const [row] = await db.select().from(careEntries).where(eq(careEntries.id, r.entryId));
    assert.ok(!row.ciphertext.includes("庭"));
    const mine = await listMyCareEntries(hana, T);
    assert.equal(mine.length, 1);
    assert.deepEqual(mine[0].data, { mood: 4, note: "お寺の庭がきれいだった" });

    const other = toCareActor(await startCareSubject(seed.templeId, "たろう"));
    assert.equal((await listMyCareEntries(other, T)).length, 0);
  });

  it("フォームの値を項目の型にそろえ、manifest にない値は捨てる", () => {
    const f = new FormData();
    f.set("mood", "2");
    f.set("note", "  ねむい ");
    f.set("evil", "x");
    assert.deepEqual(careDataFromForm(testManifest, f), { mood: 2, note: "ねむい" });
  });

  it("必須、範囲、選択肢、長さを検証する（エラーに本文を入れない）", async () => {
    await rejects(saveCareEntry(hana, T, { note: "x" }), "invalid", /気分/);
    await rejects(saveCareEntry(hana, T, { mood: 9 }), "invalid", /1〜5/);
    await rejects(saveCareEntry(hana, T, { mood: 3, feeling: "unknown" }), "invalid", /選択肢/);
    await assert.rejects(saveCareEntry(hana, T, { mood: 3, note: "秘密の話".repeat(50) }), (e: Error) => {
      assert.ok(!e.message.includes("秘密"));
      return true;
    });
    await rejects(saveCareEntry(hana, "no-such-tool", { mood: 3 }), "not_found");
  });
});

describe("同意とアラート", () => {
  it("共有していないと、危機を検知しても本人に窓口を出すだけで、アラートは作らない。管理画面には見えない", async () => {
    const r = await saveCareEntry(hana, T, { mood: 1, note: "もう消えたい" });
    assert.deepEqual({ crisis: r.crisis, alerted: r.alerted }, { crisis: true, alerted: false });
    assert.equal((await listCareAlerts(staff)).length, 0);
    assert.equal((await listSharedCareSubjects(staff)).length, 0);
    const v = await listSharedCareEntries(staff, hanaId, T);
    assert.equal(v.shared, false);
    assert.equal(v.entries.length, 0);
    const audit = await lastAudit("care.entries.view");
    assert.equal(audit.result, "not_shared");
  });

  it("共有すると記録とアラートが見え、共有をやめるとすぐに両方見えなくなる。共有し直すと過去の記録も見える", async () => {
    await saveCareEntry(hana, T, { mood: 3, note: "ふつうの日" });
    assert.equal(await getCareConsent(hana, T), false);
    assert.deepEqual(await setCareConsent(hana, T, true), { changed: true });
    assert.deepEqual(await setCareConsent(hana, T, true), { changed: false });

    const r = await saveCareEntry(hana, T, { mood: 1, feeling: "gone" });
    assert.deepEqual({ crisis: r.crisis, alerted: r.alerted }, { crisis: true, alerted: true });

    const subjects = await listSharedCareSubjects(staff);
    assert.equal(subjects.length, 1);
    assert.deepEqual(
      { nickname: subjects[0].nickname, entryCount: subjects[0].entryCount, unseen: subjects[0].unseenAlerts },
      { nickname: "はな", entryCount: 2, unseen: 1 },
    );
    const v = await listSharedCareEntries(staff, hanaId, T);
    assert.equal(v.entries.length, 2);
    assert.equal(v.entries[0].crisis, true);
    const alerts = await listCareAlerts(staff);
    assert.equal(alerts.length, 1);
    assert.equal(await countUnseenCareAlerts(staff), 1);

    await setCareConsent(hana, T, false);
    assert.equal((await listSharedCareSubjects(staff)).length, 0);
    assert.equal((await listSharedCareEntries(staff, hanaId, T)).entries.length, 0);
    assert.equal((await listCareAlerts(staff, { includeSeen: true })).length, 0);
    assert.equal(await countUnseenCareAlerts(staff), 0);
    await rejects(markCareAlertSeen(staff, alerts[0].id), "not_found");

    await setCareConsent(hana, T, true);
    assert.equal((await listSharedCareEntries(staff, hanaId, T)).entries.length, 2);

    const history = await listMyCareConsentHistory(hana, T);
    assert.deepEqual(history.map((h) => h.shared), [true, false, true]);
    const rows = await db.select().from(careConsents).where(eq(careConsents.subjectId, hanaId));
    assert.equal(rows.length, 3);
  });

  it("あとから共有しても、共有する前の危機の記録にはアラートを作らない", async () => {
    await saveCareEntry(hana, T, { mood: 1, note: "死にたい" });
    await setCareConsent(hana, T, true);
    assert.equal((await listCareAlerts(staff)).length, 0);
    const v = await listSharedCareEntries(staff, hanaId, T);
    assert.equal(v.entries[0].crisis, true);
  });

  it("アラートを確認済みにすると、未確認の一覧から消え、誰が確認したかが残る", async () => {
    await setCareConsent(hana, T, true);
    await saveCareEntry(hana, T, { mood: 1, note: "消えたい" });
    const [a] = await listCareAlerts(staff);
    await markCareAlertSeen(staff, a.id);
    assert.equal((await listCareAlerts(staff)).length, 0);
    const all = await listCareAlerts(staff, { includeSeen: true });
    assert.equal(all[0].seenByName !== null, true);
  });
});

describe("監査ログ", () => {
  it("同意の変更、記録の閲覧、アラートの表示と確認を残す。本文とニックネームは残さない", async () => {
    await setCareConsent(hana, T, true);
    await saveCareEntry(hana, T, { mood: 1, note: "とても秘密の言葉 消えたい" });
    await listSharedCareEntries(staff, hanaId, T);
    const [a] = await listCareAlerts(staff);
    await markCareAlertSeen(staff, a.id);

    for (const action of ["care.consent.set", "care.entries.view", "care.alerts.view", "care.alert.seen"]) {
      assert.ok(await lastAudit(action), action);
    }
    const consent = await lastAudit("care.consent.set");
    assert.equal(consent.channel, "care");
    assert.match(consent.actor, /^care:相談者 [0-9a-f]{8}$/);

    const logs = await db.select().from(auditLogs).where(like(auditLogs.action, "care.%"));
    for (const l of logs) {
      const text = JSON.stringify(l);
      assert.ok(!text.includes("秘密") && !text.includes("はな"), text);
    }
  });
});

describe("操作者の制限", () => {
  it("MCP の操作者は、すべての関数で拒否する", async () => {
    await setCareConsent(hana, T, true);
    await rejects(listSharedCareSubjects(mcpStaff), "forbidden", /MCP/);
    await rejects(listSharedCareEntries(mcpStaff, hanaId, T), "forbidden", /MCP/);
    await rejects(listCareAlerts(mcpStaff), "forbidden", /MCP/);
    await rejects(countUnseenCareAlerts(mcpStaff), "forbidden", /MCP/);
    await rejects(markCareAlertSeen(mcpStaff, hanaId), "forbidden", /MCP/);
    await rejects(saveCareEntry(mcpStaff, T, { mood: 3 }), "forbidden", /MCP/);
    await rejects(listMyCareEntries(mcpStaff, T), "forbidden", /MCP/);
    await rejects(setCareConsent(mcpStaff, T, true), "forbidden", /MCP/);
    await rejects(getCareConsent({ ...hana, channel: "mcp" }, T), "forbidden", /MCP/);
  });

  it("相談者は管理者の関数を使えず、スタッフは相談者の関数を使えない", async () => {
    await rejects(listSharedCareSubjects(hana), "forbidden");
    await rejects(listSharedCareEntries(hana, hanaId, T), "forbidden");
    await rejects(listCareAlerts(hana), "forbidden");
    await rejects(saveCareEntry(staff, T, { mood: 3 }), "forbidden");
    await rejects(listMyCareEntries(staff, T), "forbidden");
  });

  it("MCP のツールに、ケアの入口がない", async () => {
    const { allTools } = await import("@/mcp/tools");
    for (const t of allTools) assert.ok(!/care|kokoro|ケア/i.test(`${t.name} ${t.description}`), t.name);
  });
});
