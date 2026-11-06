// 招待コードでの登録（最初の 1 回だけ）。QR コードの URL（?code=）から来ると、コードが入った状態になる
import Link from "next/link";
import { formatInviteCode, lookupInvite, normalizeInviteCode } from "@/domain/portal";
import { PortalForm } from "../../_components/portal-form";
import { ErrorBox, PageTitle, inputClass } from "../../_components/ui";

export const metadata = { title: "はじめての登録 | 檀家ポータル" };

const LOOKUP_MESSAGES = {
  used: "この招待コードはすでに使われています。登録がお済みの方は、ログインの画面からメールアドレスでログインしてください。",
  expired: "この招待コードは有効期限が切れています。お手数ですが、お寺にお問い合わせください。",
  not_found: "招待コードが見つかりません。お手元の案内のコードをお確かめください。",
  unavailable: "この招待コードは使えません。お寺にお問い合わせください。",
} as const;

export default async function RegisterPage({ searchParams }: PageProps<"/portal/register">) {
  const sp = await searchParams;
  const codeParam = typeof sp.code === "string" ? sp.code : "";
  const lookup = codeParam ? await lookupInvite(codeParam) : null;
  const code = codeParam ? formatInviteCode(normalizeInviteCode(codeParam)) : "";

  return (
    <main>
      <PageTitle back={null}>はじめての登録</PageTitle>
      <p className="mb-5">
        お寺からお届けした案内の<strong>招待コード</strong>と、ふだんお使いの<strong>メールアドレス</strong>を入力してください。
        2 回目からは、メールアドレスだけでログインできます。
      </p>
      <ErrorBox message={sp.error} />
      {lookup?.status === "ok" && (
        <p className="mb-5 rounded-lg bg-white px-4 py-3">
          {lookup.householdName} <strong>{lookup.personName}</strong> 様の招待コードです。
          {lookup.hasAccount && " すでに登録がありますが、このコードで登録し直すと、メールアドレスが新しいものに変わります。"}
        </p>
      )}
      {lookup && lookup.status !== "ok" && <ErrorBox message={LOOKUP_MESSAGES[lookup.status]} />}
      <PortalForm action="/portal/register/submit" submitLabel="登録する" pendingLabel="登録しています…">
        <label className="block">
          <span className="font-bold">招待コード（8 文字）</span>
          <input
            name="code"
            defaultValue={code}
            required
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="例: ABCD-EFGH"
            className={`${inputClass} font-mono tracking-widest`}
          />
        </label>
        <label className="block">
          <span className="font-bold">メールアドレス</span>
          <input name="email" type="email" required autoComplete="email" inputMode="email" className={inputClass} />
        </label>
      </PortalForm>
      <p className="mt-8">
        登録がお済みの方は <Link href="/portal/login" className="underline">ログイン</Link>
      </p>
    </main>
  );
}
