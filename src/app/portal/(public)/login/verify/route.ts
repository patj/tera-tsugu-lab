// マジックリンク（GET /portal/login/verify?token=…）。ページでは cookie を書けないので、ルートハンドラーで受ける。
// 期限切れ・使用済み・知らないトークンは、理由を添えてログインの画面に戻す
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isDomainError } from "@/domain/core";
import { consumeLoginLink } from "@/domain/portal";
import { PORTAL_DEV_LINK_COOKIE, startPortalSession } from "@/lib/portal-auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  try {
    const account = await consumeLoginLink(token);
    await startPortalSession(account.id);
    (await cookies()).delete({ name: PORTAL_DEV_LINK_COOKIE, path: "/portal/login" });
    return NextResponse.redirect(new URL("/portal", req.url), 303);
  } catch (e) {
    if (!isDomainError(e)) throw e;
    const url = new URL("/portal/login", req.url);
    url.searchParams.set("error", e.message);
    return NextResponse.redirect(url, 303);
  }
}
