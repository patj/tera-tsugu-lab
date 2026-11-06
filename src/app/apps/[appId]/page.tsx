// アプリの画面。上に基盤の帯（アプリの名前、共有の状態と設定へのリンク）を出し、その下にアプリの App.tsx を出す
import Link from "next/link";
import { AppStorageProvider } from "@/apps-sdk/storage";
import { getAppSharing, listMyAppDocuments } from "@/domain/apps";
import { requireAppSession } from "@/lib/apps-auth";
import { BackLink, SharedBadge, loadApp } from "../_components/ui";

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
      <BackLink href="/apps">アプリの一覧へ</BackLink>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold leading-snug">
          <span aria-hidden className="mr-2">
            {manifest.icon}
          </span>
          {manifest.name}
        </h1>
        {manifest.sharing && (
          <Link href={`/apps/${encodeURIComponent(appId)}/sharing`} className="flex items-center gap-2 text-base underline">
            <SharedBadge shared={shared} />
            共有の設定
          </Link>
        )}
      </div>
      <AppStorageProvider appId={appId} initialDocs={docs}>
        <App manifest={manifest} />
      </AppStorageProvider>
    </main>
  );
}
