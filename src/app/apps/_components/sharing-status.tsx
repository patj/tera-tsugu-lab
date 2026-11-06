"use client";

// 基盤の帯に出す、共有の状態と、共有の設定の画面へのリンク（すべての共有に対応したアプリで必ず出す。spec.md §7）。
// アプリが useAppSharing で共有を変えると、この表示も同時に変わる。1 件ずつの共有のアプリでは「選んだものだけ」と添える
import Link from "next/link";
import { useAppSharing } from "@/apps-sdk";
import { SharedBadge } from "./shared-badge";

export function SharingStatus({ appId }: { appId: string }) {
  const { available, perDoc, shared } = useAppSharing();
  if (!available) return null;
  return (
    <Link href={`/apps/${encodeURIComponent(appId)}/sharing`} className="flex items-center gap-2 text-base underline">
      <SharedBadge shared={shared} perDoc={perDoc} />
      共有の設定
    </Link>
  );
}
