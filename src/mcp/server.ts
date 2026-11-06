// MCP サーバー（stdio）のエントリポイント。Claude Desktop から起動する（README を参照）。
// 注意: 標準出力は MCP の通信に使うので、console.log を使わない（ログは console.error に出す）。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getStaffByEmail, staffActor } from "@/domain/core";
import { bindTools } from "./framework/bind";
import { ToolRuntime } from "./framework/runtime";
import { allTools } from "./tools";

const INSTRUCTIONS = [
  "お寺の業務（檀家の台帳、年忌法要、スタッフのカレンダー、施設予約、行事のアンケート）を扱うサーバー。",
  "日時はすべて日本時間で扱う。日付が会話に出てきたら、whoami で今日の日付を確かめてから年を補う。",
  "書き込みのツールは実行せずにプレビューを返す。プレビューを住職に見せ、了承を得てから confirm_action を呼ぶ。",
  "他のスタッフの私的な予定は「予定あり」と時間しか返らない。内容を推測して伝えない。",
  "用語: 法要を担当できるスタッフ（is_officiant）は「法要の担当者」と呼ぶ（「導師」とは言わない）。戒名は「法号」、複数の年忌をあわせて営むことは「複数霊位供養」と呼ぶ。",
].join("\n");

async function main() {
  const email = process.env.MCP_ACTOR;
  if (!email) throw new Error("環境変数 MCP_ACTOR（操作者のスタッフのメールアドレス）を設定してください");
  const staff = await getStaffByEmail(email);
  if (!staff) throw new Error(`MCP_ACTOR のスタッフが見つかりません: ${email}`);
  const actor = { ...staffActor(staff, "mcp"), staffId: staff.id };

  const server = new McpServer({ name: "tera-tsugu", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  bindTools(server, new ToolRuntime(allTools), () => ({ actor, now: new Date() }));
  await server.connect(new StdioServerTransport());
  console.error(`tera-tsugu MCP サーバーを起動しました（操作者: ${staff.roleTitle} ${staff.name}）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
