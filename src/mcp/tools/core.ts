// 基盤（core）の MCP ツール
import { z } from "zod";
import { formatJst, getTemple, getStaffById, listStaff, writeAuditLog } from "@/domain/core";
import { defineReadTool, defineWriteTool, type ToolDef } from "../framework/define";

const whoami = defineReadTool({
  name: "whoami",
  description: "操作者（MCP_ACTOR のスタッフ）、お寺、今の日時（日本時間）、スタッフの一覧を返す。会話の最初に、今日の日付を確かめるのに使う。",
  input: {},
  handler: async (_args, { actor, now }) => {
    const temple = await getTemple(actor.templeId);
    const me = await getStaffById(actor.staffId);
    const staff = await listStaff(actor.templeId);
    return {
      now: formatJst(now),
      temple: { name: temple.name, sect: temple.preset.label },
      actor: me && { name: me.name, role: me.roleTitle },
      staff: staff.map((s) => ({ name: s.name, role: s.roleTitle, is_officiant: s.isOfficiant })),
    };
  },
});

// TODO(各機能のツールがそろったら消す): 2 段階の確認を試すための仮の書き込みツール。監査ログに 1 行を書くだけ
const debugWriteNote = defineWriteTool({
  name: "debug_write_note",
  description: "【動作確認用】監査ログにメモを 1 行書く。2 段階の確認（プレビュー → confirm_action）を試すためのツール。",
  input: { note: z.string().min(1).max(200).describe("書くメモ") },
  preview: async ({ note }) => ({
    summary: `監査ログに次のメモを書きます: 「${note}」`,
    details: { note },
  }),
  execute: async ({ note }, { actor }) => {
    await writeAuditLog(actor, { action: "debug_write_note.execute", summary: note, result: "ok" });
    return { written: note };
  },
});

export const coreTools: ToolDef[] = [whoami, debugWriteNote];
