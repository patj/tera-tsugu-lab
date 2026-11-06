// アプリの画面。上に基盤の帯（アプリの名前、共有の状態と設定へのリンク）を出し、その下にアプリの App.tsx を出す。
// 帯の共有の状態は、アプリの作りにかかわらず必ず出す（本人が状態を確かめ、いつでもやめられるように。spec.md §7）
import { AppStorageProvider } from "@/apps-sdk/storage";
import { getAppSharing, listMyAppDocuments } from "@/domain/apps";
import { requireAppSession } from "@/lib/apps-auth";
import { SharingStatus } from "../_components/sharing-status";
import { BackLink, loadApp } from "../_components/ui";

export default async function AppPage({ params }: PageProps<"/apps/[appId]">) {
  const { actor } = await requireAppSession();
  const { appId, manifest, views } = loadApp((await params).appId);
  const [docs, shared] = await Promise.all([
    listMyAppDocuments(actor, appId),
    manifest.sharing ? getAppSharing(actor, appId) : Promise.resolve(false),
  ]);
  const { App } = views;
  return (
    <main>
      <AppStorageProvider appId={appId} manifest={manifest} initialDocs={docs} sharing={{ available: manifest.sharing, shared }}>
        <BackLink href="/apps">アプリの一覧へ</BackLink>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold leading-snug">
            <span aria-hidden className="mr-2">
              {manifest.icon}
            </span>
            {manifest.name}
          </h1>
          <SharingStatus appId={appId} />
        </div>
        <App manifest={manifest} />
      </AppStorageProvider>
    </main>
  );
}
