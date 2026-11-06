// ケアのポータルの画面の部品（スマートフォン向け、大きめの文字）
import Link from "next/link";
import type { ReactNode } from "react";
import type { CareManifest } from "@/care-sdk";

export function PageTitle({ children, back = "/care" }: { children: ReactNode; back?: string | null }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back} className="mb-3 inline-block text-base text-stone-600 underline">
          ← {back === "/care" ? "はじめの画面へ" : "戻る"}
        </Link>
      )}
      <h1 className="text-2xl font-bold leading-snug">{children}</h1>
    </div>
  );
}

export function ErrorBox({ message }: { message?: string | string[] | null }) {
  const m = Array.isArray(message) ? message[0] : message;
  if (!m) return null;
  return (
    <p role="alert" className="mb-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
      {m}
    </p>
  );
}

export function DoneBox({ children }: { children: ReactNode }) {
  return <p className="mb-5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900">{children}</p>;
}

export function SharedBadge({ shared }: { shared: boolean }) {
  return shared ? (
    <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">お寺と共有中</span>
  ) : (
    <span className="rounded-full bg-stone-200 px-3 py-1 text-sm text-stone-700">自分だけ</span>
  );
}

/** ツールの画面の上に出すタブ（記録する / ふりかえる / 共有の設定） */
export function ToolTabs({ manifest, current }: { manifest: CareManifest; current: "entry" | "history" | "sharing" }) {
  const base = `/care/t/${encodeURIComponent(manifest.id)}`;
  const tabs = [
    { key: "entry", href: base, label: "記録する" },
    { key: "history", href: `${base}/history`, label: "ふりかえる" },
    { key: "sharing", href: `${base}/sharing`, label: "共有の設定" },
  ];
  return (
    <nav className="mb-6 grid grid-cols-3 gap-2">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-lg px-2 py-3 text-center text-base ${t.key === current ? "bg-sky-700 font-bold text-white" : "border border-stone-300 bg-white"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
