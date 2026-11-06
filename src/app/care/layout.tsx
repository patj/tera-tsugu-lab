// ケアのポータル（匿名。スマートフォン向け、大きめの文字）。spec.md §7
// すべての画面に「診断や治療は行いません」と、相談窓口への案内を出す
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { CareDisclaimer } from "@/care-sdk";
import { getDefaultTempleId, getTemple } from "@/domain/core";

export const metadata: Metadata = { title: "こころのよりどころ", robots: { index: false, follow: false } };

export default async function CareLayout({ children }: LayoutProps<"/care">) {
  await connection();
  const temple = await getTemple(await getDefaultTempleId());
  return (
    <div className="flex min-h-full flex-1 flex-col bg-stone-50 text-lg leading-relaxed">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/care" className="text-xl font-bold">
            {temple.name} こころのよりどころ
          </Link>
          <Link href="/care/help" className="whitespace-nowrap rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-base font-bold text-rose-900">
            相談窓口
          </Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-6">{children}</div>
      <footer className="mx-auto w-full max-w-xl space-y-3 px-4 pb-8">
        <CareDisclaimer />
        <p className="text-base text-stone-600">
          記録は暗号化して保存します。お寺と共有する設定にしたツールの記録だけを、お寺の方が読みます。AI には一切渡しません。
        </p>
      </footer>
    </div>
  );
}
