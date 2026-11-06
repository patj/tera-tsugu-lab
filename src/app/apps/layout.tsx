// お寺のアプリ（匿名）。spec.md §7
// お寺の画面の枠（ヘッダーと下の説明）は、各ページが FramedShell で出す。全画面のアプリ（display: "fullscreen"）は枠を出さない
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = { title: "お寺のアプリ", robots: { index: false, follow: false } };

export default async function AppsLayout({ children }: LayoutProps<"/apps">) {
  await connection();
  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
