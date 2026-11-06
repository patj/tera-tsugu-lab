// アプリごとの Web App Manifest（manifest に pwa があるアプリだけ）。spec.md §7「全画面とホーム画面」
// ホーム画面に追加すると、/apps/<app-id> を単独のアプリのように開く。アイコンは /app-assets/<app-id>/ の素材
import { NextResponse, type NextRequest } from "next/server";
import { buildWebAppManifest, findApp } from "@/domain/apps";

export async function GET(_req: NextRequest, ctx: RouteContext<"/apps/[appId]/manifest.webmanifest">) {
  const m = findApp(decodeURIComponent((await ctx.params).appId));
  const body = m ? buildWebAppManifest(m) : null;
  if (!body) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return new NextResponse(JSON.stringify(body), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
