// お寺のアプリの利用者の画面の部品（スマートフォン向け、大きめの文字）
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { APP_VIEWS } from "@/apps-sdk/views.generated";
import { findApp } from "@/domain/apps";

export { SharedBadge, sharedLabel } from "./shared-badge";

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

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mb-3 inline-block text-base text-stone-600 underline">
      ← {children}
    </Link>
  );
}

/** URL のアプリの ID から、manifest と画面を取り出す。なければ 404 */
export function loadApp(rawAppId: string) {
  const appId = decodeURIComponent(rawAppId);
  const manifest = findApp(appId);
  const views = APP_VIEWS[appId];
  if (!manifest || !views) notFound();
  return { appId, manifest, views };
}
