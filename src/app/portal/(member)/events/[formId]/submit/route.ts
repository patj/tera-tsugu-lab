// 行事への申し込み（POST）。回答（answers）は設問の ID → 値の JSON。回答者と世帯は操作者の本人から決める
import type { NextRequest } from "next/server";
import { invalid } from "@/domain/core";
import type { Answers } from "@/domain/forms";
import { submitPortalEvent } from "@/domain/portal";
import { portalPost, str } from "../../../../_lib/post";

export async function POST(req: NextRequest, ctx: RouteContext<"/portal/events/[formId]/submit">) {
  const { formId } = await ctx.params;
  return portalPost(req, `/portal/events/${formId}`, async ({ actor, form }) => {
    let answers: Answers;
    try {
      const parsed: unknown = JSON.parse(str(form, "answers") || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      answers = parsed as Answers;
    } catch {
      throw invalid("申し込みの内容が読み取れませんでした。ページを読み込み直してください。");
    }
    await submitPortalEvent(actor, formId, answers);
    return "/portal/events?done=1";
  });
}
