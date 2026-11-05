// npm run mcp:config: Claude Desktop の設定（claude_desktop_config.json の mcpServers）を、この環境の絶対パスで出力する。
// Claude Desktop は PATH が短く、作業ディレクトリも指定しないで起動するので、node と tsx と tsconfig を絶対パスで書く。
import path from "node:path";
import { DEFAULT_DATABASE_URL } from "../src/db/client";
import { ROOT } from "./lib";

const name = process.argv[2] ?? "tera-tsugu";
const config = {
  mcpServers: {
    [name]: {
      command: process.execPath,
      args: [
        path.join(ROOT, "node_modules/tsx/dist/cli.mjs"),
        "--tsconfig",
        path.join(ROOT, "tsconfig.json"),
        path.join(ROOT, "src/mcp/server.ts"),
      ],
      env: {
        DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
        MCP_ACTOR: process.env.MCP_ACTOR ?? "jushoku@example.com",
      },
    },
  },
};
console.log(JSON.stringify(config, null, 2));
