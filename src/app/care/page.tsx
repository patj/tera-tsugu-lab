// はじめの画面: この端末で始めていなければニックネームの入力、始めていればツールの一覧
import Link from "next/link";
import { countMyCareEntries, getCareConsent, listCareTools } from "@/domain/care";
import { findCareSession } from "@/lib/care-auth";
import { startCareAction } from "./actions";
import { ErrorBox, SharedBadge } from "./_components/ui";

export default async function CareHome({ searchParams }: PageProps<"/care">) {
  const sp = await searchParams;
  const session = await findCareSession();
  if (!session) return <Start error={sp.error} />;

  const tools = listCareTools();
  const counts = await countMyCareEntries(session.actor);
  const shared = await Promise.all(tools.map((t) => getCareConsent(session.actor, t.id)));
  return (
    <main>
      <ErrorBox message={sp.error} />
      <p className="mb-6">
        <span className="font-bold">{session.subject.nickname}</span> さん、ようこそ。今日の気持ちを、すこし書きとめてみませんか。
      </p>
      {tools.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white px-5 py-4 text-stone-700">
          まだ使えるツールがありません。お寺がツールを用意するまで、お待ちください。
        </p>
      ) : (
        <ul className="space-y-4">
          {tools.map((t, i) => (
            <li key={t.id}>
              <Link href={`/care/t/${encodeURIComponent(t.id)}`} className="block rounded-xl border border-stone-200 bg-white px-5 py-4 hover:bg-stone-50">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-xl font-bold">
                    <span aria-hidden className="mr-2">
                      {t.icon}
                    </span>
                    {t.name}
                  </span>
                  <SharedBadge shared={shared[i]} />
                </span>
                <span className="mt-2 block text-base text-stone-700">{t.description}</span>
                <span className="mt-1 block text-base text-stone-500">記録 {counts[t.id] ?? 0} 件</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Start({ error }: { error?: string | string[] }) {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-bold">はじめに</h1>
      <ErrorBox message={error} />
      <div className="space-y-3 rounded-xl border border-stone-200 bg-white px-5 py-4">
        <p>ここは、気持ちを書きとめて、ふりかえるための場所です。</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>名前やメールアドレスはいりません。</strong>ニックネームだけで始められます。
          </li>
          <li>
            記録は<strong>この端末（このブラウザ）</strong>にひもづきます。
            <strong>端末を変えたり、ブラウザのデータを消したりすると、記録には戻れません。</strong>
          </li>
          <li>記録は、あなただけが読めます。ツールごとに「お寺と共有する」を選んだときだけ、お寺の方も読みます。共有はいつでもやめられます。</li>
          <li>診断や治療は行いません。</li>
        </ul>
      </div>
      <form action={startCareAction} className="mt-6 space-y-5">
        <label className="block">
          <span className="font-bold">ニックネーム</span>
          <span className="mt-1 block text-base text-stone-600">本名でなくてかまいません（20 文字まで）</span>
          <input name="nickname" required maxLength={20} autoComplete="off" className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg" />
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="understood" value="1" required className="mt-1 h-6 w-6" />
          <span>端末を変えると記録に戻れないことを理解しました</span>
        </label>
        <button type="submit" className="w-full rounded-xl bg-sky-700 px-5 py-4 text-xl font-bold text-white">
          はじめる
        </button>
      </form>
    </main>
  );
}
