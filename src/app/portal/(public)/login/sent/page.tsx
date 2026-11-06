// 「メールを送りました」の画面。ハッカソン版はメールを送らないので、開発用にリンクをここに表示する
import { cookies } from "next/headers";
import Link from "next/link";
import { PORTAL_DEV_LINK_COOKIE, showDevLoginLink } from "@/lib/portal-auth";
import { PageTitle } from "../../../_components/ui";

export const metadata = { title: "ログイン用のリンク | 檀家ポータル" };

export default async function LoginSentPage() {
  const dev = showDevLoginLink() ? (await cookies()).get(PORTAL_DEV_LINK_COOKIE)?.value : undefined;
  return (
    <main>
      <PageTitle back={null}>メールをお送りしました</PageTitle>
      <p className="mb-4">
        ご登録のメールアドレスに、ログイン用のリンクをお送りしました。メールを開いて、リンクを押してください。
      </p>
      <ul className="mb-6 list-disc space-y-1 pl-6">
        <li>リンクの有効期限は 15 分です。</li>
        <li>リンクは 1 回だけ使えます。</li>
        <li>メールが届かないときは、メールアドレスをお確かめのうえ、もう一度お試しください。</li>
      </ul>
      {dev !== undefined && (
        <section className="mb-6 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-4 py-4">
          <p className="text-base font-bold text-amber-900">開発用の受信箱（メールの代わり）</p>
          {dev && dev !== "none" ? (
            <>
              <p className="mt-2 text-base">ハッカソン版はメールを送りません。次のリンクがメールで届いたものとします。</p>
              {/* 1 回だけ使えるリンクなので、先読みされないように <a> にする */}
              <a href={dev} className="mt-3 block break-all rounded-lg bg-white px-4 py-3 text-lg font-bold text-sky-800 underline">
                ログインする
              </a>
              <p className="mt-2 break-all font-mono text-sm text-stone-600">{dev}</p>
            </>
          ) : (
            <p className="mt-2 text-base">このメールアドレスのアカウントはありません（開発用の表示。本番では何も表示しません）。</p>
          )}
        </section>
      )}
      <Link href="/portal/login" className="underline">
        ログインの画面に戻る
      </Link>
    </main>
  );
}
