// お寺のアプリ（匿名。スマートフォン向け、大きめの文字）。spec.md §7
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getDefaultTempleId, getTemple } from "@/domain/core";

export const metadata: Metadata = { title: "お寺のアプリ", robots: { index: false, follow: false } };

export default async function AppsLayout({ children }: LayoutProps<"/apps">) {
  await connection();
  const temple = await getTemple(await getDefaultTempleId());
  return (
    <div className="flex min-h-full flex-1 flex-col bg-stone-50 text-lg leading-relaxed">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-xl px-4 py-3">
          <Link href="/apps" className="text-xl font-bold">
            {temple.name} のアプリ
          </Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-6">{children}</div>
      <footer className="mx-auto w-full max-w-xl px-4 pb-8 text-base text-stone-600">
        データは暗号化して保存します。「お寺と共有する」にしたアプリのデータだけを、お寺の方が読みます。AI には渡しません。
      </footer>
    </div>
  );
}
