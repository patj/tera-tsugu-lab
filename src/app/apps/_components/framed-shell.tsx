// お寺の画面の枠（ヘッダー、幅の決まった本文、下の説明）。はじめの画面、アプリの一覧、共有の設定、display: "framed" のアプリで使う。
// display: "fullscreen" のアプリは、この枠を使わない（spec.md §7「全画面とホーム画面」）
import Link from "next/link";
import type { ReactNode } from "react";
import { getDefaultTempleId, getTemple } from "@/domain/core";

export async function FramedShell({ children }: { children: ReactNode }) {
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
        データは暗号化して保存します。「お寺と共有する」にしたアプリのデータだけを、お寺の方が読みます。AI を使うアプリでは、同意したときだけ、入力した内容を AI（Anthropic 社の Claude）に送ります（このシステムには保存しません）。
      </footer>
    </div>
  );
}
