// 1 件ずつの共有の印を付ける・外す（PUT { shared: boolean }。sharing: "perDoc" のアプリだけ）。useAppStorage の setShared が呼ぶ。
// 変更は監査ログに残る（ドメイン層の setAppDocumentShared）
import type { NextRequest } from "next/server";
import { invalid } from "@/domain/core";
import { setAppDocumentShared } from "@/domain/apps";
import { handle, readBody } from "../../../../_lib";

export async function PUT(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/docs/[docId]/sharing">) {
  const { appId, docId } = await ctx.params;
  return handle(req, async (actor) => {
    const { shared } = await readBody(req);
    if (typeof shared !== "boolean") throw invalid("shared を true か false で送ってください");
    return { doc: await setAppDocumentShared(actor, appId, docId, shared) };
  });
}
