// AI に送ることへの同意（GET: 今の状態、PUT { version, agreed }: 同意する・やめる）。useAppAI が呼ぶ。
// version は利用者に見せた説明の版。今の説明と違えば、同意を受け付けない。変更は履歴と監査ログに残る
import type { NextRequest } from "next/server";
import { invalid } from "@/domain/core";
import { getAppAiConsent, setAppAiConsent } from "@/domain/apps";
import { handle } from "../../_lib";

export async function GET(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/ai-consent">) {
  const { appId } = await ctx.params;
  return handle(req, async (actor) => ({ consented: await getAppAiConsent(actor, appId) }));
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/ai-consent">) {
  const { appId } = await ctx.params;
  return handle(req, async (actor) => {
    const body = (await req.json().catch(() => null)) as { version?: unknown; agreed?: unknown } | null;
    if (typeof body?.agreed !== "boolean" || typeof body.version !== "string") throw invalid("version と agreed を送ってください");
    return setAppAiConsent(actor, appId, body.version, body.agreed);
  });
}
