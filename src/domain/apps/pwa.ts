// お寺のアプリをホーム画面に追加するための Web App Manifest と、はじめる画面からの戻り先。spec.md §7「全画面とホーム画面」
import { normalizeAssetPath, type AppManifest } from "@/apps-sdk/types";

/** アプリの素材の URL（本体は /app-assets/<app-id>/ から配信する。npm run apps:gen） */
export function appAssetUrl(appId: string, path: string): string {
  return `/app-assets/${encodeURIComponent(appId)}/${normalizeAssetPath(path)}`;
}

/** Web App Manifest（manifest に pwa があるアプリだけ。なければ null） */
export function buildWebAppManifest(m: AppManifest): Record<string, unknown> | null {
  if (!m.pwa) return null;
  const start = `/apps/${encodeURIComponent(m.id)}`;
  return {
    id: start,
    name: m.name,
    short_name: m.name.length > 12 ? m.name.slice(0, 12) : m.name,
    description: m.description,
    lang: "ja",
    start_url: start,
    // はじめる画面（/apps）と共有の設定（/apps/<id>/sharing）も、アプリの中として開く
    scope: "/apps/",
    display: "standalone",
    background_color: m.pwa.backgroundColor,
    theme_color: m.pwa.themeColor,
    icons: [{ src: appAssetUrl(m.id, m.pwa.icon), sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}

/** はじめる画面のあとに戻る先（/apps/<app-id> の形だけを許す。ほかのサイトや別の画面には移さない） */
export function safeAppsReturnPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  return /^\/apps\/[a-z0-9_][a-z0-9-]*$/.test(next) ? next : null;
}
