// 試す画面（npm run dev）。apps/ の中のアプリを、本体に近い見た目で試す。
// - 利用者の画面: 本体の帯（または全画面の右上のボタン）と、アプリの App.tsx
// - スタッフの画面: 共有されているときに、本体の管理画面で見える Admin.tsx（sharing: "perDoc" では、印の付いた文書だけ）
// データはブラウザの中にだけ保存する（試すためだけ）。AI は試す画面のサーバーが Claude を呼ぶ。このファイルは変えなくてよい
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useAppAIConsentControl } from "../sdk/ai-client";
import { PreviewStorageProvider, clearPreviewData, loadPreviewData, useAppSharing } from "../sdk/storage";
import { appSharesPerDoc, appUsesSharing, type AppAdminProps, type AppManifest, type AppProps } from "../sdk/types";

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
  const [phone, setPhone] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    location.hash = encodeURIComponent(dir);
  }, [dir]);
  const entry = ENTRIES.find((e) => e.dir === dir) ?? ENTRIES[0];

  return (
    <div className="flex min-h-screen flex-col">
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
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={phone} onChange={(e) => setPhone(e.target.checked)} />
            スマホの幅
          </label>
          {entry && (
            <button
              type="button"
              className="ml-auto rounded border border-stone-500 px-3 py-1"
              onClick={() => {
                if (confirm("このアプリの、試すためのデータ（と AI の同意）を消しますか？")) {
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
        <PhoneFrame on={phone}>
          <UserView key={`${entry.dir}:${version}`} entry={entry} />
        </PhoneFrame>
      ) : (
        <AdminView key={`${entry.dir}:${version}`} entry={entry} />
      )}
    </div>
  );
}

/** スマホの幅（390px）で見る */
function PhoneFrame({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <div className="flex flex-1 flex-col">{children}</div>;
  return (
    <div className="flex flex-1 justify-center bg-stone-300 py-6">
      <div className="relative flex h-[844px] w-[390px] flex-col overflow-auto rounded-[2rem] border-8 border-stone-800 bg-white" style={{ transform: "translateZ(0)" }}>
        {children}
      </div>
    </div>
  );
}

/** 本体の利用者の画面（/apps/<app-id>）に近い見た目 */
function UserView({ entry }: { entry: Entry }) {
  const { manifest, App } = entry;
  const fullscreen = manifest.display === "fullscreen";
  const app = App ? <App manifest={manifest} /> : <p className="text-red-800">App.tsx がありません</p>;
  return (
    <PreviewStorageProvider manifest={manifest} assetsBaseUrl={`/apps/${encodeURIComponent(entry.dir)}/assets`}>
      {fullscreen ? (
        // 全画面: アプリが画面全体を使う。基盤は右上に小さなボタンだけを出す（本体と同じ。アプリは右上の 48px 四方をあけておく）
        <div className="relative flex min-h-full flex-1 flex-col">
          {app}
          <FrameworkMenu manifest={manifest} />
        </div>
      ) : (
        <div className="flex-1 bg-stone-50 text-lg leading-relaxed">
          <div className="border-b border-stone-200 bg-white">
            <p className="mx-auto max-w-xl px-4 py-3 text-xl font-bold">〇〇寺 のアプリ</p>
          </div>
          <main className="mx-auto w-full max-w-xl px-4 py-6">
            <p className="mb-3 text-base text-stone-600 underline">← アプリの一覧へ</p>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-bold leading-snug">
                <span aria-hidden className="mr-2">
                  {manifest.icon}
                </span>
                {manifest.name}
              </h1>
              <FrameworkMenu manifest={manifest} inline />
            </div>
            {app}
          </main>
          <p className="mx-auto max-w-xl px-4 pb-8 text-base text-stone-600">
            {manifest.ai ? "（本体では、ここに「AI に送る内容があります」という説明が出ます）" : "（本体では、ここに「AI には渡しません」という説明が出ます）"}
            試す画面のデータは、このブラウザの中にだけ保存されます。
          </p>
        </div>
      )}
    </PreviewStorageProvider>
  );
}

/** 基盤の部品: 共有の状態と切り替え、AI の同意。ふつうの表示では帯の中、全画面では右上の小さなボタン */
function FrameworkMenu({ manifest, inline = false }: { manifest: AppManifest; inline?: boolean }) {
  const { available: sharingOn, perDoc, shared, share, unshare, pending } = useAppSharing();
  const { available: aiOn, consented, revoke } = useAppAIConsentControl();
  const [open, setOpen] = useState(false);
  if (inline && !sharingOn && !aiOn) return null;
  const badge = sharingOn ? (
    shared ? (
      <span className="whitespace-nowrap rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">{perDoc ? "お寺と共有中（選んだものだけ）" : "お寺と共有中"}</span>
    ) : (
      <span className="whitespace-nowrap rounded-full bg-stone-200 px-3 py-1 text-sm text-stone-700">自分だけ</span>
    )
  ) : null;
  return (
    <div className={inline ? "relative text-base" : "fixed right-2 top-2 z-[900] text-base"} style={inline ? undefined : { position: "absolute" }}>
      <button
        type="button"
        aria-label="お寺のアプリのメニュー"
        onClick={() => setOpen((o) => !o)}
        className={inline ? "flex items-center gap-2 underline" : "flex h-10 min-w-10 items-center justify-center gap-1 rounded-full bg-white/90 px-2 text-stone-800 shadow"}
      >
        {inline ? (
          <>
            {badge}
            設定
          </>
        ) : (
          <>⋯{sharingOn && shared && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="お寺と共有中" />}</>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[901] mt-2 w-72 rounded-xl border border-stone-300 bg-white p-4 text-stone-900 shadow-lg">
          <p className="font-bold">
            {manifest.icon} {manifest.name}
          </p>
          <p className="mt-1 text-sm text-stone-600">（本体の基盤のメニューのかわり）</p>
          <p className="mt-3 text-sm underline">← アプリの一覧へ</p>
          {sharingOn && (
            <div className="mt-3">
              <p className="text-sm">お寺との共有: {badge}</p>
              <button type="button" disabled={pending} onClick={() => void (shared ? unshare() : share())} className="mt-2 rounded-lg border border-stone-400 px-3 py-1 text-sm disabled:opacity-50">
                {shared ? "共有をやめる" : "お寺と共有する"}
              </button>
            </div>
          )}
          {aiOn && (
            <div className="mt-3">
              <p className="text-sm">AI への送信: {consented ? "同意している" : "同意していない"}</p>
              {consented && (
                <button type="button" onClick={() => void revoke()} className="mt-2 rounded-lg border border-stone-400 px-3 py-1 text-sm">
                  同意をやめる
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 本体の管理画面（/admin/apps/<app-id>/users/<user-id>）に近い見た目 */
function AdminView({ entry }: { entry: Entry }) {
  const { manifest, Admin } = entry;
  const data = loadPreviewData(manifest.id);
  const perDoc = appSharesPerDoc(manifest);
  // 本体と同じく、1 件ずつの共有のアプリでは印の付いた文書だけを渡す
  const docs = perDoc ? data.docs.filter((d) => d.shared) : data.docs;
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 text-lg">
      <p className="text-base text-stone-600">管理画面 › お寺のアプリ</p>
      <h1 className="mt-2 text-2xl font-bold">
        {NICKNAME} さん・{manifest.icon} {manifest.name}
      </h1>
      <div className="mt-6 max-w-3xl">
        {!appUsesSharing(manifest) ? (
          <p className="rounded border border-stone-300 bg-stone-100 px-4 py-3">
            このアプリは、お寺との共有に対応していません（manifest の sharing が false）。本体の管理画面には出ません。
          </p>
        ) : !data.shared ? (
          <p className="rounded border border-stone-300 bg-stone-100 px-4 py-3">
            共有されていません。本体の管理画面では見えません（利用者の画面で共有すると、ここに Admin.tsx が出ます）。
          </p>
        ) : perDoc && docs.length === 0 ? (
          <p className="rounded border border-stone-300 bg-stone-100 px-4 py-3">
            まだ共有するものが選ばれていません（sharing: "perDoc" のアプリでは、利用者の画面で印を付けた文書だけが、ここに出ます）。
          </p>
        ) : Admin ? (
          <>
            {perDoc && <p className="mb-3 text-base text-stone-600">利用者が選んだ {docs.length} 件だけを表示しています（本体の管理画面と同じ）。</p>}
            <Admin manifest={manifest} docs={docs} nickname={NICKNAME} />
          </>
        ) : (
          <p className="text-red-800">sharing が true か "perDoc" のアプリには Admin.tsx が必要です</p>
        )}
      </div>
    </main>
  );
}
