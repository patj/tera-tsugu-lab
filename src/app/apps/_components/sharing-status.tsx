"use client";

// 基盤の帯に出す、共有の状態と、共有の設定の画面へのリンク（すべての共有に対応したアプリで必ず出す。spec.md §7）。
// アプリが useAppSharing で共有を変えると、この表示も同時に変わる
import Link from "next/link";
import { useAppSharing } from "@/apps-sdk";

export function SharingStatus({ appId }: { appId: string }) {
  const { available, shared } = useAppSharing();
  if (!available) return null;
  return (
    <Link href={`/apps/${encodeURIComponent(appId)}/sharing`} className="flex items-center gap-2 text-base underline">
      {shared ? (
        <span className="whitespace-nowrap rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900 no-underline">お寺と共有中</span>
      ) : (
        <span className="whitespace-nowrap rounded-full bg-stone-200 px-3 py-1 text-sm text-stone-700 no-underline">自分だけ</span>
      )}
      共有の設定
    </Link>
  );
}
