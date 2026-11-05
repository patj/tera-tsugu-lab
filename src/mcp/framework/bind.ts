// ToolRuntime のツールを、MCP の SDK のサーバーに登録する
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./define";
import { CONFIRM_ACTION_DESCRIPTION, CONFIRM_ACTION_NAME, confirmActionInput, type ToolResult, type ToolRuntime } from "./runtime";

function toContent(result: ToolResult) {
  if (!result.ok) {
    return { content: [{ type: "text" as const, text: result.error }], isError: true };
  }
  const text = typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

const WRITE_NOTE =
  "\n\n【書き込み】このツールは実行せずにプレビューと confirmation_id を返す。住職の了承を得てから confirm_action で実行する。";

export function bindTools(server: McpServer, runtime: ToolRuntime, makeContext: () => ToolContext): void {
  for (const tool of runtime.list()) {
    server.registerTool(
      tool.name,
      {
        description: tool.kind === "write" ? tool.description + WRITE_NOTE : tool.description,
        inputSchema: tool.input,
        annotations: { readOnlyHint: tool.kind === "read" },
      },
      async (args: unknown) => toContent(await runtime.call(tool.name, args, makeContext())),
    );
  }
  server.registerTool(
    CONFIRM_ACTION_NAME,
    {
      description: CONFIRM_ACTION_DESCRIPTION,
      inputSchema: confirmActionInput,
      annotations: { readOnlyHint: false },
    },
    async (args: unknown) => toContent(await runtime.call(CONFIRM_ACTION_NAME, args, makeContext())),
  );
}
