// すべての機能の MCP ツール。機能を足すときは、import と配列にそれぞれ 1 行を追記する。
import type { ToolDef } from "../framework/define";
import { coreTools } from "./core";
import { formsTools } from "./forms";

export const allTools: ToolDef[] = [
  ...coreTools,
  ...formsTools,
];
