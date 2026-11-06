// 自分の文書の一覧（GET）と、文書を作る（POST { data }）
import type { NextRequest } from "next/server";
import { createAppDocument, listMyAppDocuments } from "@/domain/apps";
import { handle, readData } from "../../_lib";

export async function GET(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/docs">) {
  const { appId } = await ctx.params;
  return handle(req, async (actor) => ({ docs: await listMyAppDocuments(actor, appId) }));
}

export async function POST(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/docs">) {
  const { appId } = await ctx.params;
  return handle(req, async (actor) => ({ doc: await createAppDocument(actor, appId, await readData(req)) }));
}
