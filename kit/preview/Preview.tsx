// 試す画面（npm run dev）。apps/ の中のアプリを、本体に近い見た目で試す。
// - 利用者の画面: 本体の帯（アプリの名前、共有の状態と設定）と、アプリの App.tsx
// - スタッフの画面: 共有されているときに、本体の管理画面で見える Admin.tsx
// データはブラウザの中にだけ保存する（試すためだけ）。このファイルは変えなくてよい
import { useEffect, useState, type ComponentType } from "react";
import type { AppAdminProps, AppManifest, AppProps } from "../sdk/types";
import { useAppSharing } from "../sdk/storage";
import { PreviewStorageProvider, clearPreviewData, loadPreviewData } from "../sdk/storage";

const manifests = import.meta.glob<{ manifest: AppManifest }>("../apps/*/manifest.ts", { eager: true });
const appViews = import.meta.glob<{ default: ComponentType<AppProps> }>("../apps/*/App.tsx", { eager: true });
const adminViews = import.meta.glob<{ default: ComponentType<AppAdminProps> }>("../apps/*/Admin.tsx", { eager: true });

type Entry = { dir: string; manifest: AppManifest; App?: ComponentType<AppProps>; Admin?: ComponentType<AppAdminProps> };

const dirOf = (p: string) => p.split("/")[2];
const ENTRIES: Entry[] = Object.entries(manifests)
  .map(([p, m]) => {
    const dir = dirOf(p);
    return {
      dir,
      manifest: m.manifest,
      App: appViews[`../apps/${dir}/App.tsx`]?.default,
      Admin: adminViews[`../apps/${dir}/Admin.tsx`]?.default,
    };
  })
  // 作ったアプリを先に、ひな形（_ で始まる）を後に
  .sort((a, b) => Number(a.dir.startsWith("_")) - Number(b.dir.startsWith("_")) || a.dir.localeCompare(b.dir));

const NICKNAME = "ためし";

export function Preview() {
  const [dir, setDir] = useState(() => decodeURIComponent(location.hash.slice(1)) || ENTRIES[0]?.dir || "");
  const [tab, setTab] = useState<"user" | "admin">("user");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    location.hash = encodeURIComponent(dir);
  }, [dir]);
  const entry = ENTRIES.find((e) => e.dir === dir) ?? ENTRIES[0];

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-300 bg-stone-800 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 text-base">
          <span className="font-bold">お寺のアプリ 開発キット（試す画面）</span>
          {ENTRIES.length > 0 && (
            <select value={entry?.dir} onChange={(e) => setDir(e.target.value)} className="rounded bg-white px-2 py-1 text-stone-900">
              {ENTRIES.map((e) => (
                <option key={e.dir} value={e.dir}>
                  {e.manifest.icon} {e.manifest.name}（{e.dir}）
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-1">
            {(["user", "admin"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded px-3 py-1 ${tab === t ? "bg-white font-bold text-stone-900" : "border border-stone-500"}`}
              >
                {t === "user" ? "利用者の画面" : "スタッフの画面"}
              </button>
            ))}
          </div>
          {entry && (
            <button
              type="button"
              className="ml-auto rounded border border-stone-500 px-3 py-1"
              onClick={() => {
                if (confirm("このアプリの、試すためのデータを消しますか？")) {
                  clearPreviewData(entry.manifest.id);
                  setVersion((v) => v + 1);
                }
              }}
            >
              データを消す
            </button>
          )}
        </div>
      </header>
      {!entry ? (
        <p className="mx-auto max-w-xl px-4 py-8">apps/ にアプリがありません。apps/_template をコピーして作ってください。</p>
      ) : tab === "user" ? (
        <UserView key={`${entry.dir}:${version}`} entry={entry} />
      ) : (
        <AdminView key={`${entry.dir}:${version}`} entry={entry} />
      )}
    </div>
  );
}

/** 本体の利用者の画面（/apps/<app-id>）に近い見た目 */
function UserView({ entry }: { entry: Entry }) {
  const { manifest, App } = entry;
  return (
    <div className="bg-stone-50 text-lg leading-relaxed">
      <div className="border-b border-stone-200 bg-white">
        <p className="mx-auto max-w-xl px-4 py-3 text-xl font-bold">〇〇寺 のアプリ</p>
      </div>
      <main className="mx-auto w-full max-w-xl px-4 py-6">
        <PreviewStorageProvider appId={manifest.id} sharingAvailable={manifest.sharing}>
          <p className="mb-3 text-base text-stone-600 underline">← アプリの一覧へ</p>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold leading-snug">
              <span aria-hidden className="mr-2">
                {manifest.icon}
              </span>
              {manifest.name}
            </h1>
            <SharingBand />
          </div>
          {App ? <App manifest={manifest} /> : <p className="text-red-800">App.tsx がありません</p>}
        </PreviewStorageProvider>
      </main>
      <p className="mx-auto max-w-xl px-4 pb-8 text-base text-stone-600">
        （試す画面: データはこのブラウザの中にだけ保存されます。本体では、暗号化してお寺のサーバーに保存されます）
      </p>
    </div>
  );
}

/** 本体の帯の、共有の状態と設定（本体では「共有の設定」の画面に移る。ここでは、その場で切り替える） */
function SharingBand() {
  const { available, shared, share, unshare, pending } = useAppSharing();
  const [open, setOpen] = useState(false);
  if (!available) return null;
  return (
    <div className="text-base">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 underline">
        {shared ? (
          <span className="whitespace-nowrap rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">お寺と共有中</span>
        ) : (
          <span className="whitespace-nowrap rounded-full bg-stone-200 px-3 py-1 text-sm text-stone-700">自分だけ</span>
        )}
        共有の設定
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-stone-300 bg-white p-3">
          <p className="text-sm text-stone-600">本体の「共有の設定」の画面のかわり</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => void (shared ? unshare() : share())}
            className="mt-2 rounded-lg border border-stone-400 px-3 py-1 disabled:opacity-50"
          >
            {shared ? "共有をやめる" : "お寺と共有する"}
          </button>
        </div>
      )}
    </div>
  );
}

/** 本体の管理画面（/admin/apps/<app-id>/users/<user-id>）に近い見た目 */
function AdminView({ entry }: { entry: Entry }) {
  const { manifest, Admin } = entry;
  const data = loadPreviewData(manifest.id);
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 text-lg">
      <p className="text-base text-stone-600">管理画面 › お寺のアプリ</p>
      <h1 className="mt-2 text-2xl font-bold">
        {NICKNAME} さん・{manifest.icon} {manifest.name}
      </h1>
      <div className="mt-6 max-w-3xl">
        {!manifest.sharing ? (
          <p className="rounded border border-stone-300 bg-stone-100 px-4 py-3">
            このアプリは、お寺との共有に対応していません（manifest の sharing が false）。本体の管理画面には出ません。
          </p>
        ) : !data.shared ? (
          <p className="rounded border border-stone-300 bg-stone-100 px-4 py-3">
            共有されていません。本体の管理画面では見えません（利用者の画面で共有すると、ここに Admin.tsx が出ます）。
          </p>
        ) : Admin ? (
          <Admin manifest={manifest} docs={data.docs} nickname={NICKNAME} />
        ) : (
          <p className="text-red-800">sharing: true のアプリには Admin.tsx が必要です</p>
        )}
      </div>
    </main>
  );
}
