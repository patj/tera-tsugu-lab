// 招待コードでの登録（POST）。登録できたら、そのままログインした状態にする
import type { NextRequest } from "next/server";
import { registerWithInvite } from "@/domain/portal";
import { startPortalSession } from "@/lib/portal-auth";
import { fail, failFrom, ok, sameOrigin, str } from "../../../_lib/post";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const code = str(form, "code");
  const back = code ? `/portal/register?code=${encodeURIComponent(code)}` : "/portal/register";
  if (!sameOrigin(req)) return fail(req, "このページからは送れません。", back, 403);
  try {
    const { account, replaced } = await registerWithInvite({ code, email: str(form, "email") });
    await startPortalSession(account.id);
    return ok(req, replaced ? "/portal?welcome=again" : "/portal?welcome=1", { accountId: account.id });
  } catch (e) {
    return failFrom(req, e, back);
  }
}
