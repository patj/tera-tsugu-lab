// AI の仕事を実行する（POST { text?, images?: [{ base64 }] }）。useAppAI が呼ぶ。spec.md §7「AI」
// 同意、上限、使用の記録はドメイン層（runAppAi）が行う。送った内容と返事はログに出さない
import { NextResponse, type NextRequest } from "next/server";
import { APP_AI_LIMITS } from "@/apps-sdk/types";
import { invalid } from "@/domain/core";
import { runAppAi } from "@/domain/apps";
import { handle } from "../../../_lib";

/** 画像 4 枚（base64 で約 1.37 倍）と文字が入る大きさ */
const MAX_BODY_BYTES = Math.ceil(APP_AI_LIMITS.maxImages * APP_AI_LIMITS.maxImageBytes * 1.4) + APP_AI_LIMITS.maxTextChars * 4 + 4096;

export async function POST(req: NextRequest, ctx: RouteContext<"/apps/api/[appId]/ai/[task]">) {
  const { appId, task } = await ctx.params;
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, kind: "invalid_input", message: "送る内容が大きすぎます" }, { status: 413 });
  }
  return handle(req, async (actor) => {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) throw invalid("送る内容が大きすぎます");
    let body: { text?: unknown; images?: unknown };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      throw invalid("送る内容の形が正しくありません");
    }
    const images = Array.isArray(body.images)
      ? body.images.map((i) => ({ base64: typeof (i as { base64?: unknown })?.base64 === "string" ? (i as { base64: string }).base64 : "" }))
      : undefined;
    return runAppAi(actor, appId, task, { text: typeof body.text === "string" ? body.text : undefined, images });
  });
}
