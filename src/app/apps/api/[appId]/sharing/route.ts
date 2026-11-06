// お寺との共有の状態（GET）と変更（PUT { shared: boolean }）。useAppSharing が呼ぶ。
// 変更は履歴（app_consents）と監査ログに残る（ドメイン層の setAppSharing）
import type { NextRequest } from "next/server";
import { invalid } from "@/domain/core";
import { getAppSharing, setAppSharing } from "@/domain/apps";
import { handle } from "../../_lib";

export async function GET(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/sharing">) {
  const { appId } = await ctx.params;
  return handle(req, async (actor) => ({ shared: await getAppSharing(actor, appId) }));
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/sharing">) {
  const { appId } = await ctx.params;
  return handle(req, async (actor) => {
    const body = (await req.json().catch(() => null)) as { shared?: unknown } | null;
    if (typeof body?.shared !== "boolean") throw invalid("shared を true か false で送ってください");
    await setAppSharing(actor, appId, body.shared);
    return { shared: await getAppSharing(actor, appId) };
  });
}
