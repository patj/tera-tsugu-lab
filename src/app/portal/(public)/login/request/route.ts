// ログイン用のリンクを作る（POST）。ハッカソン版はメールを送らず、開発用の画面（/portal/login/sent）にリンクを表示する。
// 登録のないメールアドレスでも、利用者には同じ案内を出す（登録の有無を知られないように）
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { LOGIN_LINK_MINUTES, loginLinkUrl, requestLoginLink } from "@/domain/portal";
import { PORTAL_DEV_LINK_COOKIE, showDevLoginLink } from "@/lib/portal-auth";
import { fail, failFrom, ok, sameOrigin, str } from "../../../_lib/post";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail(req, "このページからは送れません。", "/portal/login", 403);
  try {
    const form = await req.formData();
    const link = await requestLoginLink(str(form, "email"));
    if (!showDevLoginLink()) {
      // 本番ではここでメールを送る（ハッカソン後）
      return ok(req, "/portal/login/sent");
    }
    // 開発用: リンクは、いま開いているホストで作る（APP_BASE_URL がほかのポートを指していても、そのまま開けるように）
    const devLink = link ? loginLinkUrl(link.token, req.nextUrl.origin) : "";
    (await cookies()).set(PORTAL_DEV_LINK_COOKIE, devLink || "none", {
      httpOnly: true,
      sameSite: "lax",
      path: "/portal/login",
      maxAge: LOGIN_LINK_MINUTES * 60,
    });
    return ok(req, "/portal/login/sent", { devLink: devLink || null });
  } catch (e) {
    return failFrom(req, e, "/portal/login");
  }
}
