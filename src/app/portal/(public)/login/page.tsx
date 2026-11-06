// ログイン: メールアドレスを入力すると、ログイン用のリンク（15 分有効、1 回だけ）が届く
import Link from "next/link";
import { redirect } from "next/navigation";
import { findCurrentPortal } from "@/lib/portal-auth";
import { PortalForm } from "../../_components/portal-form";
import { DoneBox, ErrorBox, PageTitle, inputClass } from "../../_components/ui";

export const metadata = { title: "ログイン | 檀家ポータル" };

export default async function PortalLoginPage({ searchParams }: PageProps<"/portal/login">) {
  const sp = await searchParams;
  if (!sp.error && (await findCurrentPortal())) redirect("/portal");
  return (
    <main>
      <PageTitle back={null}>ログイン</PageTitle>
      {sp.logout && <DoneBox>ログアウトしました。</DoneBox>}
      <ErrorBox message={sp.error} />
      <p className="mb-5">
        登録したメールアドレスを入力してください。ログイン用のリンクをお送りします（パスワードはいりません）。
      </p>
      <PortalForm action="/portal/login/request" submitLabel="ログイン用のリンクを送る">
        <label className="block">
          <span className="font-bold">メールアドレス</span>
          <input name="email" type="email" required autoComplete="email" inputMode="email" className={inputClass} />
        </label>
      </PortalForm>
      <p className="mt-8">
        はじめての方は、お寺からお届けした招待コードで <Link href="/portal/register" className="underline">登録</Link> してください。
      </p>
    </main>
  );
}
