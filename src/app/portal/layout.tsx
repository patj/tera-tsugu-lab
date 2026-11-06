// 檀家ポータル（スマートフォン向け、大きめの文字）。ログインが必要なページは (member)、登録とログインは (public)
import type { Metadata } from "next";
import { connection } from "next/server";
import { getDefaultTempleId, getTemple } from "@/domain/core";

export const metadata: Metadata = { title: "檀家ポータル" };

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  await connection();
  const temple = await getTemple(await getDefaultTempleId());
  return (
    <div className="flex min-h-full flex-1 flex-col bg-stone-50 text-lg leading-relaxed">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-xl px-4 py-3">
          <p className="text-xl font-bold">{temple.name} 檀家ポータル</p>
        </div>
      </header>
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-6">{children}</div>
      <footer className="mx-auto w-full max-w-xl px-4 pb-8 text-base text-stone-500">
        ご不明な点は、お寺にお電話でお問い合わせください。
      </footer>
    </div>
  );
}
