// 施設の空き状況と申請の公開ページ（ログインなし。スマートフォン向け、大きめの文字）
import Link from "next/link";
import { connection } from "next/server";
import { getDefaultTempleId, getTemple } from "@/domain/core";

export default async function ReserveLayout({ children }: LayoutProps<"/reserve">) {
  await connection();
  const temple = await getTemple(await getDefaultTempleId());
  return (
    <div className="flex min-h-full flex-1 flex-col text-lg">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-xl px-4 py-3">
          <Link href="/reserve" className="block text-xl font-bold">
            {temple.name} 施設のご利用
          </Link>
          <nav className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-base">
            <Link href="/reserve" className="underline">
              空き状況
            </Link>
            <Link href="/reserve/apply" className="underline">
              利用を申請する
            </Link>
            <Link href="/reserve/status" className="underline">
              申請の状況を確かめる
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
