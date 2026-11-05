import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { closeDb, db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { getStaffById, invalid, staffActor } from "@/domain/core";
import { defineReadTool, defineWriteTool, type ToolContext } from "@/mcp/framework/define";
import { ToolRuntime, type ToolResult } from "@/mcp/framework/runtime";
import { allTools } from "@/mcp/tools";
import { resetDb } from "../helpers/db";

const NOW = new Date("2026-11-05T01:00:00Z");
const executed: string[] = [];

const echo = defineReadTool({
  name: "echo",
  description: "テスト用",
  input: { text: z.string() },
  handler: async ({ text }) => ({ text }),
});

const record = defineWriteTool({
  name: "record",
  description: "テスト用の書き込み",
  input: { value: z.string(), fail: z.boolean().optional() },
  preview: async ({ value }) => {
    if (value === "") throw invalid("値が空です");
    return { summary: `「${value}」を記録します` };
  },
  execute: async ({ value, fail }) => {
    if (fail) throw invalid("実行の時点で状況が変わりました");
    executed.push(value);
    return { recorded: value };
  },
});

const received: number[] = [];
const doubling = defineWriteTool({
  name: "doubling",
  description: "テスト用（引数に transform がある書き込み）",
  input: { n: z.number().transform((x) => x * 2) },
  preview: async ({ n }) => ({ summary: `${n} を記録します` }),
  execute: async ({ n }) => {
    received.push(n);
    return { n };
  },
});

let runtime: ToolRuntime;
let ctx: ToolContext;
let otherCtx: ToolContext;

function data(r: ToolResult): Record<string, unknown> {
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  return (r as { data: Record<string, unknown> }).data;
}
function error(r: ToolResult): string {
  assert.equal(r.ok, false);
  return (r as { error: string }).error;
}
async function lastAudit() {
  const [row] = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(1);
  return row;
}

describe("MCP のツールの実行（2 段階の確認と監査ログ）", () => {
  beforeEach(async () => {
    const seed = await resetDb();
    executed.length = 0;
    received.length = 0;
    runtime = new ToolRuntime([echo, record, doubling]);
    const jushoku = (await getStaffById(seed.get("staff:jushoku")))!;
    const fuku = (await getStaffById(seed.get("staff:fukujushoku")))!;
    ctx = { actor: { ...staffActor(jushoku, "mcp"), staffId: jushoku.id }, now: NOW };
    otherCtx = { actor: { ...staffActor(fuku, "mcp"), staffId: fuku.id }, now: NOW };
  });
  after(async () => {
    await closeDb();
  });

  it("読み取りのツールはすぐに結果を返し、監査ログに残す", async () => {
    assert.deepEqual(data(await runtime.call("echo", { text: "やあ" }, ctx)), { text: "やあ" });
    const log = await lastAudit();
    assert.equal(log.action, "echo");
    assert.equal(log.channel, "mcp");
    assert.equal(log.result, "ok");
    assert.match(log.actor, /住職/);
  });

  it("引数が正しくなければエラーを返し、監査ログに残す", async () => {
    assert.match(error(await runtime.call("echo", { text: 1 }, ctx)), /引数が正しくありません/);
    assert.match((await lastAudit()).result ?? "", /^error:/);
  });

  it("書き込みのツールは実行せずにプレビューと confirmation_id を返す", async () => {
    const d = data(await runtime.call("record", { value: "a" }, ctx));
    assert.equal(d.status, "needs_confirmation");
    assert.equal(d.preview, "「a」を記録します");
    assert.equal(typeof d.confirmation_id, "string");
    assert.deepEqual(executed, []);
    assert.equal((await lastAudit()).result, "needs_confirmation");
  });

  it("confirm_action で実行される。同じ確認は 2 回実行できない", async () => {
    const { confirmation_id } = data(await runtime.call("record", { value: "a" }, ctx));
    const done = data(await runtime.call("confirm_action", { confirmation_id }, ctx));
    assert.equal(done.status, "done");
    assert.deepEqual(done.result, { recorded: "a" });
    assert.deepEqual(executed, ["a"]);
    const log = await lastAudit();
    assert.equal(log.action, "confirm_action");
    assert.equal(log.target, `record:${confirmation_id}`);
    assert.equal(log.result, "ok");

    assert.match(error(await runtime.call("confirm_action", { confirmation_id }, ctx)), /すでに実行済み/);
    assert.deepEqual(executed, ["a"]);
  });

  it("有効期限（10 分）を過ぎた確認は実行できない", async () => {
    const { confirmation_id } = data(await runtime.call("record", { value: "a" }, ctx));
    const later = { ...ctx, now: new Date(NOW.getTime() + 10 * 60_000) };
    assert.match(error(await runtime.call("confirm_action", { confirmation_id }, later)), /有効期限/);
    assert.deepEqual(executed, []);
  });

  it("ほかの操作者が求めた確認は実行できない", async () => {
    const { confirmation_id } = data(await runtime.call("record", { value: "a" }, ctx));
    assert.match(error(await runtime.call("confirm_action", { confirmation_id }, otherCtx)), /別の操作者/);
    assert.deepEqual(executed, []);
  });

  it("知らない confirmation_id はエラーになる", async () => {
    assert.match(error(await runtime.call("confirm_action", { confirmation_id: "nope" }, ctx)), /見つかりません/);
  });

  it("プレビューの検証エラーは、そのまま利用者向けのメッセージで返す", async () => {
    assert.equal(error(await runtime.call("record", { value: "" }, ctx)), "値が空です");
  });

  it("実行に失敗したら、エラーを返し、有効期限の内なら再実行できる", async () => {
    const { confirmation_id } = data(await runtime.call("record", { value: "a", fail: true }, ctx));
    assert.match(error(await runtime.call("confirm_action", { confirmation_id }, ctx)), /実行できませんでした: 実行の時点で状況が変わりました/);
    assert.match((await lastAudit()).result ?? "", /^error:/);
    // 印が外れているので、もう一度呼ぶと（また失敗するが）「実行済み」にはならない
    assert.match(error(await runtime.call("confirm_action", { confirmation_id }, ctx)), /実行できませんでした/);
  });

  it("引数の transform は、プレビューと実行でそれぞれ 1 回だけかかる", async () => {
    const d = data(await runtime.call("doubling", { n: 3 }, ctx));
    assert.equal(d.preview, "6 を記録します");
    data(await runtime.call("confirm_action", { confirmation_id: d.confirmation_id }, ctx));
    assert.deepEqual(received, [6]);
  });

  it("ツール名の重複と予約名は、起動の時点でエラーにする", () => {
    assert.throws(() => new ToolRuntime([echo, echo]), /重複/);
    assert.throws(() => new ToolRuntime([{ ...echo, name: "confirm_action" }]), /予約/);
  });

  it("登録済みのツール（whoami と仮の書き込み）が動く", async () => {
    const rt = new ToolRuntime(allTools);
    const who = data(await rt.call("whoami", {}, ctx));
    assert.equal((who.temple as { name: string }).name, "妙縁寺");
    assert.equal(who.now, "2026-11-05（木）10:00");

    const { confirmation_id } = data(await rt.call("debug_write_note", { note: "試し" }, ctx));
    data(await rt.call("confirm_action", { confirmation_id }, ctx));
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, "debug_write_note.execute"));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].summary, "試し");
  });
});
