// アプリの画面。spec.md §7
// - display: "framed"（初期値）: お寺の画面の枠の中に、基盤の帯（アプリの名前、共有の状態と設定、AI の同意）とアプリの App.tsx を出す
// - display: "fullscreen": 枠を出さず、アプリが画面全体を使う。基盤は右上の小さなボタン（FullscreenMenu）だけを出す
// 共有の状態と、AI の同意をやめる道は、どちらの出し方でも必ず出す（本人が状態を確かめ、いつでもやめられるように）
// manifest に pwa があれば、ホーム画面に追加するための Web App Manifest と、iPhone 向けの設定を出す
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppStorageProvider } from "@/apps-sdk/storage";
import { appUsesSharing } from "@/apps-sdk/types";
import { appAssetUrl, findApp, getAppAiConsent, getAppSharing, listMyAppDocuments } from "@/domain/apps";
import { requireAppSession } from "@/lib/apps-auth";
import { AiConsentStatus } from "../_components/ai-consent-status";
import { FramedShell } from "../_components/framed-shell";
import { FullscreenMenu } from "../_components/fullscreen-menu";
import { SharingStatus } from "../_components/sharing-status";
import { BackLink, loadApp } from "../_components/ui";

export async function generateMetadata({ params }: PageProps<"/apps/[appId]">): Promise<Metadata> {
  const m = findApp(decodeURIComponent((await params).appId));
  if (!m) return {};
  if (!m.pwa) return { title: m.name };
  return {
    title: m.name,
    manifest: `/apps/${encodeURIComponent(m.id)}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: m.name, statusBarStyle: "default" },
    icons: { apple: appAssetUrl(m.id, m.pwa.icon) },
  };
}

export async function generateViewport({ params }: PageProps<"/apps/[appId]">): Promise<Viewport> {
  const m = findApp(decodeURIComponent((await params).appId));
  return m?.pwa ? { themeColor: m.pwa.themeColor } : {};
}

export default async function AppPage({ params }: PageProps<"/apps/[appId]">) {
  const { appId, manifest, views } = loadApp((await params).appId);
  const { actor } = await requireAppSession(`/apps/${encodeURIComponent(appId)}`);
  const [docs, shared, aiConsent] = await Promise.all([
    listMyAppDocuments(actor, appId),
    appUsesSharing(manifest) ? getAppSharing(actor, appId) : Promise.resolve(false),
    manifest.ai ? getAppAiConsent(actor, appId) : Promise.resolve(false),
  ]);
  const { App } = views;
  const provider = (children: ReactNode) => (
    <AppStorageProvider appId={appId} manifest={manifest} initialDocs={docs} initialAiConsent={aiConsent} sharing={{ available: appUsesSharing(manifest), shared }}>
      {children}
    </AppStorageProvider>
  );

  if (manifest.display === "fullscreen") {
    return provider(
      <div className="relative flex min-h-full flex-1 flex-col">
        <App manifest={manifest} />
        <FullscreenMenu manifest={manifest} />
      </div>,
    );
  }

  return (
    <FramedShell>
      <main>
        {provider(
          <>
            <BackLink href="/apps">アプリの一覧へ</BackLink>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-bold leading-snug">
                <span aria-hidden className="mr-2">
                  {manifest.icon}
                </span>
                {manifest.name}
              </h1>
              <div className="flex flex-wrap items-center gap-3">
                <SharingStatus appId={appId} />
                <AiConsentStatus />
              </div>
            </div>
            <App manifest={manifest} />
          </>,
        )}
      </main>
    </FramedShell>
  );
}
