"use client";

// お寺との共有の操作（文言、デザイン、置き場所はアプリが自由に決めてよい）。
// ルール: 共有をオンにする前に、何が共有されるか（お寺の方が読めるようになる、過去の分も含む、いつでもやめられる）を本人に説明する（apps/CLAUDE.md）
import { useAppSharing } from "@/apps-sdk";

export function SharingPanel() {
  const { available, shared, share, unshare, pending, error } = useAppSharing();
  if (!available) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      {shared ? (
        <>
          <p>このメモは、お寺の方も読めるようになっています。</p>
          <button type="button" onClick={() => void unshare()} disabled={pending} className="mt-3 rounded-lg border border-stone-400 bg-white px-4 py-2 disabled:opacity-50">
            お寺に見せるのをやめる
          </button>
        </>
      ) : (
        <>
          <p>お寺の方に読んでもらうこともできます。</p>
          <p className="mt-1 text-base text-stone-700">
            共有すると、これまでのメモも含めて、お寺の方が読めるようになります（読むだけで、直したり消したりはしません）。いつでもやめられます。
          </p>
          <button type="button" onClick={() => void share()} disabled={pending} className="mt-3 rounded-lg bg-amber-600 px-4 py-2 font-bold text-white disabled:opacity-50">
            お寺に見せる
          </button>
        </>
      )}
      {error && <p className="mt-2 text-red-800">{error}</p>}
    </section>
  );
}
