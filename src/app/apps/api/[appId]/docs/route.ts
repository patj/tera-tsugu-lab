// 自分の文書の一覧（GET）、文書を作る（POST { data }）、すべて消す（DELETE）
import type { NextRequest } from "next/server";
import { createAppDocument, deleteAllAppDocuments, listMyAppDocuments } from "@/domain/apps";
import { handle, readData } from "../../_lib";

export async function GET(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/docs">) {
  const { appId } = await ctx.params;
  return handle(req, async (actor) => ({ docs: await listMyAppDocuments(actor, appId) }));
}

export async function POST(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/docs">) {
  const { appId } = await ctx.params;
  return handle(req, async (actor) => ({ doc: await createAppDocument(actor, appId, await readData(req)) }));
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/docs">) {
  const { appId } = await ctx.params;
  return handle(req, async (actor) => ({ deleted: await deleteAllAppDocuments(actor, appId) }));
}
