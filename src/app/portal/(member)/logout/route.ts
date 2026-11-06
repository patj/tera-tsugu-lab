// ログアウト（POST）
import { NextResponse, type NextRequest } from "next/server";
import { endPortalSession } from "@/lib/portal-auth";
import { sameOrigin } from "../../_lib/post";

export async function POST(req: NextRequest) {
  if (sameOrigin(req)) await endPortalSession();
  return NextResponse.redirect(new URL("/portal/login?logout=1", req.url), 303);
}
