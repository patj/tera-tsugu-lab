"use client";

// 全画面のアプリ（display: "fullscreen"）の右上に出す、基盤の小さなボタンとメニュー。spec.md §7「全画面とホーム画面」
// アプリの作りにかかわらず、本人がアプリの一覧に戻り、共有の状態を確かめてやめ、AI の同意をやめられるようにする。
// アプリは右上の 48px 四方をあけておく（apps/CLAUDE.md）
import Link from "next/link";
import { useState } from "react";
import { useAppSharing } from "@/apps-sdk";
import { useAppAIConsentControl } from "@/apps-sdk/ai-client";
import type { AppManifest } from "@/apps-sdk/types";

export function FullscreenMenu({ manifest }: { manifest: AppManifest }) {
  const { available: sharingOn, perDoc, shared, unshare, pending } = useAppSharing();
  const { available: aiOn, consented, revoke } = useAppAIConsentControl();
  const [open, setOpen] = useState(false);
  const base = `/apps/${encodeURIComponent(manifest.id)}`;
  return (
    <div className="fixed right-2 z-[900] text-base text-stone-900" style={{ top: "max(0.5rem, env(safe-area-inset-top))" }}>
      <button
        type="button"
        aria-label="お寺のアプリのメニュー"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 min-w-10 items-center justify-center gap-1 rounded-full bg-white/90 px-2 shadow"
      >
        <span aria-hidden>⋯</span>
        {sharingOn && shared && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="お寺と共有中" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-stone-300 bg-white p-4 leading-relaxed shadow-lg">
          <p className="font-bold">
            {manifest.icon} {manifest.name}
          </p>
          <Link href="/apps" className="mt-3 block underline">
            ← アプリの一覧へ
          </Link>
          {sharingOn && (
            <div className="mt-3 border-t border-stone-200 pt-3">
              <p>
                お寺との共有:{" "}
                {shared ? (
                  <span className="font-bold text-amber-900">{perDoc ? "共有中（選んだものだけ）" : "共有中"}</span>
                ) : (
                  <span className="text-stone-700">自分だけ</span>
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                {shared && (
                  <button type="button" disabled={pending} onClick={() => void unshare()} className="rounded-lg border border-stone-400 px-3 py-1 disabled:opacity-50">
                    共有をやめる
                  </button>
                )}
                <Link href={`${base}/sharing`} className="py-1 underline">
                  共有の設定
                </Link>
              </div>
            </div>
          )}
          {aiOn && (
            <div className="mt-3 border-t border-stone-200 pt-3">
              <p>AI に送る: {consented ? <span className="font-bold text-sky-900">同意中</span> : "同意していない"}</p>
              {consented && (
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm("AI に送ることへの同意をやめますか？（AI を使う部分は、同意し直すまで使えません）")) await revoke();
                  }}
                  className="mt-2 rounded-lg border border-stone-400 px-3 py-1"
                >
                  同意をやめる
                </button>
              )}
            </div>
          )}
          <p className="mt-3 border-t border-stone-200 pt-3 text-sm text-stone-600">
            データは暗号化して保存します。{aiOn ? "AI には、同意したときだけ、入力した内容を送ります（このシステムには保存しません）。" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
