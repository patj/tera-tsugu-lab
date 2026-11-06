// URL のツールの ID から、manifest と画面（プラグイン）を取り出す。なければ 404
import { notFound } from "next/navigation";
import { CARE_TOOL_VIEWS } from "@/care-sdk/views.generated";
import { findCareTool } from "@/domain/care";

export function loadCareTool(rawToolId: string) {
  const toolId = decodeURIComponent(rawToolId);
  const def = findCareTool(toolId);
  const views = CARE_TOOL_VIEWS[toolId];
  if (!def || !views) notFound();
  return { toolId, manifest: def.manifest, views };
}
