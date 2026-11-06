// 自分の文書の一覧（GET）、文書を作る（POST { data, shared? }。shared は 1 件ずつの共有のアプリだけ）、すべて消す（DELETE）
import type { NextRequest } from "next/server";
import { createAppDocument, deleteAllAppDocuments, listMyAppDocuments } from "@/domain/apps";
import { handle, readBody } from "../../_lib";

export async function GET(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/docs">) {
  const { appId } = await ctx.params;
  return handle(req, async (actor) => ({ docs: await listMyAppDocuments(actor, appId) }));
}

export async function POST(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/docs">) {
  const { appId } = await ctx.params;
  return handle(req, async (actor) => {
    const body = await readBody(req);
    return { doc: await createAppDocument(actor, appId, body.data, { shared: body.shared as boolean | undefined }) };
  });
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/docs">) {
  const { appId } = await ctx.params;
  return handle(req, async (actor) => ({ deleted: await deleteAllAppDocuments(actor, appId) }));
}
