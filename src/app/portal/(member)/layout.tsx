// ログインが必要なページ。各ページも requirePortal() でログインを確かめる（レイアウトはページを移っても読み直されないため）
import Link from "next/link";
import { requirePortal } from "@/lib/portal-auth";

export default async function MemberLayout({ children }: LayoutProps<"/portal">) {
  const { ctx } = await requirePortal();
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-base">
        <Link href="/portal" className="font-bold underline">
          ホーム
        </Link>
        <span className="flex-1 truncate text-right text-stone-700">
          {ctx.household.name} {ctx.person.name} さん（{ctx.isContact ? "窓口" : "ご家族"}）
        </span>
        <form method="post" action="/portal/logout">
          <button type="submit" className="whitespace-nowrap rounded border border-stone-300 px-3 py-1">
            ログアウト
          </button>
        </form>
      </div>
      {children}
    </>
  );
}
