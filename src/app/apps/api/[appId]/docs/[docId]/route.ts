// 自分の文書を置き換える（PUT { data }）・消す（DELETE）
import type { NextRequest } from "next/server";
import { deleteAppDocument, updateAppDocument } from "@/domain/apps";
import { handle, readData } from "../../../_lib";

export async function PUT(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/docs/[docId]">) {
  const { appId, docId } = await ctx.params;
  return handle(req, async (actor) => ({ doc: await updateAppDocument(actor, appId, docId, await readData(req)) }));
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/docs/[docId]">) {
  const { appId, docId } = await ctx.params;
  return handle(req, async (actor) => {
    await deleteAppDocument(actor, appId, docId);
    return { ok: true };
  });
}
