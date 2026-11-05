// ツールの呼び出しの本体。MCP の SDK に依存しないので、テストから直接呼べる。
// 2 段階の確認（pending_actions）と、すべての呼び出しの監査ログを受け持つ。
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { pendingActions } from "@/db/schema";
import { formatJst, isDomainError, writeAuditLog } from "@/domain/core";
import type { ToolContext, ToolDef } from "./define";

/** 確認の有効期限（spec.md §4） */
export const CONFIRMATION_TTL_MIN = 10;

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export const CONFIRM_ACTION_NAME = "confirm_action";

export const CONFIRM_ACTION_DESCRIPTION =
  "書き込みのツールが返したプレビューを、住職が会話の中で了承したあとに呼び、はじめて実行する。" +
  "住職の了承がないまま呼んではいけない。confirmation_id の有効期限は 10 分。";

export const confirmActionInput = {
  confirmation_id: z.string().describe("書き込みのツールが返した confirmation_id"),
};

function summarizeArgs(args: unknown): string {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}

function errorMessage(e: unknown): string {
  if (isDomainError(e)) return e.message;
  if (e instanceof z.ZodError) {
    return `引数が正しくありません: ${e.issues.map((i) => `${i.path.join(".") || "(全体)"}: ${i.message}`).join(" / ")}`;
  }
  if (e instanceof Error && /^(日付|日時|時刻|存在しない日付)/.test(e.message)) return e.message;
  console.error(e);
  return "内部エラーが起きました。管理画面で確かめてください";
}

export class ToolRuntime {
  private readonly tools = new Map<string, ToolDef>();

  constructor(tools: ToolDef[]) {
    for (const t of tools) {
      if (t.name === CONFIRM_ACTION_NAME) throw new Error(`${CONFIRM_ACTION_NAME} は予約されたツール名です`);
      if (this.tools.has(t.name)) throw new Error(`ツール名が重複しています: ${t.name}`);
      this.tools.set(t.name, t);
    }
  }

  list(): ToolDef[] {
    return [...this.tools.values()];
  }

  async call(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
    if (name === CONFIRM_ACTION_NAME) return this.confirm(rawArgs, ctx);

    const tool = this.tools.get(name);
    if (!tool) return { ok: false, error: `ツールが見つかりません: ${name}` };

    let result: ToolResult;
    try {
      const args = z.object(tool.input).parse(rawArgs ?? {});
      if (tool.kind === "read") {
        result = { ok: true, data: await tool.handler(args as never, ctx) };
      } else {
        result = { ok: true, data: await this.requestConfirmation(tool, args, ctx) };
      }
    } catch (e) {
      result = { ok: false, error: errorMessage(e) };
    }

    await writeAuditLog(ctx.actor, {
      action: name,
      summary: summarizeArgs(rawArgs),
      result: result.ok ? (tool.kind === "write" ? "needs_confirmation" : "ok") : `error: ${result.error}`,
    });
    return result;
  }

  private async requestConfirmation(tool: Extract<ToolDef, { kind: "write" }>, args: unknown, ctx: ToolContext) {
    const preview = await tool.preview(args as never, ctx);
    const confirmationId = randomBytes(9).toString("base64url");
    const expiresAt = new Date(ctx.now.getTime() + CONFIRMATION_TTL_MIN * 60_000);
    await db.insert(pendingActions).values({
      confirmationId,
      templeId: ctx.actor.templeId,
      tool: tool.name,
      actorStaffId: ctx.actor.staffId,
      payload: args as object,
      preview: preview.summary,
      expiresAt,
    });
    return {
      status: "needs_confirmation",
      confirmation_id: confirmationId,
      expires_at: formatJst(expiresAt),
      preview: preview.summary,
      details: preview.details,
      next_step:
        "まだ実行していません。この内容を住職に見せて了承を得てから、confirm_action を confirmation_id つきで呼んでください。" +
        "了承が得られない場合や、内容を変える場合は、confirm_action を呼ばないでください。",
    };
  }

  private async confirm(rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
    let result: ToolResult;
    let target: string | undefined;
    try {
      const { confirmation_id } = z.object(confirmActionInput).parse(rawArgs ?? {});
      target = confirmation_id;
      // 同じ確認を 2 回実行しないように、条件つきの UPDATE で「実行中」の印をつける
      const [claimed] = await db
        .update(pendingActions)
        .set({ executedAt: ctx.now })
        .where(
          and(
            eq(pendingActions.confirmationId, confirmation_id),
            eq(pendingActions.templeId, ctx.actor.templeId),
            eq(pendingActions.actorStaffId, ctx.actor.staffId),
            isNull(pendingActions.executedAt),
            gt(pendingActions.expiresAt, ctx.now),
          ),
        )
        .returning();

      if (!claimed) {
        result = { ok: false, error: await this.explainUnclaimable(confirmation_id, ctx) };
      } else {
        target = `${claimed.tool}:${confirmation_id}`;
        const tool = this.tools.get(claimed.tool);
        if (!tool || tool.kind !== "write") {
          result = { ok: false, error: `ツールが見つかりません: ${claimed.tool}` };
        } else {
          try {
            const args = z.object(tool.input).parse(claimed.payload);
            const data = await tool.execute(args as never, ctx);
            result = { ok: true, data: { status: "done", tool: tool.name, result: data } };
          } catch (e) {
            // 実行に失敗したら印を外す（原因を取り除けば、有効期限の内に同じ confirmation_id で再実行できる）
            await db
              .update(pendingActions)
              .set({ executedAt: null })
              .where(eq(pendingActions.confirmationId, confirmation_id));
            result = { ok: false, error: `実行できませんでした: ${errorMessage(e)}` };
          }
        }
      }
    } catch (e) {
      result = { ok: false, error: errorMessage(e) };
    }

    await writeAuditLog(ctx.actor, {
      action: CONFIRM_ACTION_NAME,
      target,
      summary: summarizeArgs(rawArgs),
      result: result.ok ? "ok" : `error: ${result.error}`,
    });
    return result;
  }

  private async explainUnclaimable(confirmationId: string, ctx: ToolContext): Promise<string> {
    const [row] = await db.select().from(pendingActions).where(eq(pendingActions.confirmationId, confirmationId));
    if (!row || row.templeId !== ctx.actor.templeId) return "confirmation_id が見つかりません";
    if (row.actorStaffId !== ctx.actor.staffId) return "この確認は、別の操作者が求めたものです";
    if (row.executedAt) return "この確認は、すでに実行済みです";
    if (row.expiresAt.getTime() <= ctx.now.getTime()) {
      return "確認の有効期限（10 分）が切れました。もう一度、書き込みのツールを呼んでプレビューからやり直してください";
    }
    return "この確認は実行できません";
  }
}
