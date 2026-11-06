// はじめの画面: この端末で始めていなければニックネームの入力、始めていればアプリの一覧
import Link from "next/link";
import { countMyAppDocuments, getAppSharing, listApps, safeAppsReturnPath } from "@/domain/apps";
import { findAppSession } from "@/lib/apps-auth";
import { startAppsAction } from "./actions";
import { FramedShell } from "./_components/framed-shell";
import { ErrorBox, SharedBadge } from "./_components/ui";

export default async function AppsHome({ searchParams }: PageProps<"/apps">) {
  const sp = await searchParams;
  const session = await findAppSession();
  if (!session) {
    return (
      <FramedShell>
        <Start error={sp.error} next={safeAppsReturnPath(sp.next)} />
      </FramedShell>
    );
  }

  const apps = listApps();
  const counts = await countMyAppDocuments(session.actor);
  const shared = await Promise.all(apps.map((a) => (a.sharing ? getAppSharing(session.actor, a.id) : Promise.resolve(false))));
  return (
    <FramedShell>
      <main>
        <ErrorBox message={sp.error} />
        <p className="mb-6">
          <span className="font-bold">{session.user.nickname}</span> さん、ようこそ。
        </p>
        {apps.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-white px-5 py-4 text-stone-700">まだ使えるアプリがありません。</p>
        ) : (
          <ul className="space-y-4">
            {apps.map((a, i) => (
              <li key={a.id}>
                <Link href={`/apps/${encodeURIComponent(a.id)}`} className="block rounded-xl border border-stone-200 bg-white px-5 py-4 hover:bg-stone-50">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-xl font-bold">
                      <span aria-hidden className="mr-2">
                        {a.icon}
                      </span>
                      {a.name}
                    </span>
                    {a.sharing && <SharedBadge shared={shared[i]} />}
                  </span>
                  <span className="mt-2 block text-base text-stone-700">{a.description}</span>
                  {(counts[a.id] ?? 0) > 0 && <span className="mt-1 block text-base text-stone-500">{counts[a.id]} 件</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </FramedShell>
  );
}

function Start({ error, next }: { error?: string | string[]; next: string | null }) {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-bold">はじめに</h1>
      <ErrorBox message={error} />
      <div className="space-y-3 rounded-xl border border-stone-200 bg-white px-5 py-4">
        <p>お寺が用意したアプリを使えます。</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>名前やメールアドレスはいりません。</strong>ニックネームだけで始められます。
          </li>
          <li>
            データは<strong>この端末（このブラウザ）</strong>にひもづきます。
            <strong>端末を変えたり、ブラウザのデータを消したりすると、データには戻れません。</strong>
          </li>
          <li>データは、あなただけが見られます。アプリごとに「お寺と共有する」を選んだときだけ、お寺の方も読みます。共有はいつでもやめられます。</li>
        </ul>
      </div>
      <form action={startAppsAction} className="mt-6 space-y-5">
        {next && <input type="hidden" name="next" value={next} />}
        <label className="block">
          <span className="font-bold">ニックネーム</span>
          <span className="mt-1 block text-base text-stone-600">本名でなくてかまいません（20 文字まで）</span>
          <input name="nickname" required maxLength={20} autoComplete="off" className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg" />
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="understood" value="1" required className="mt-1 h-6 w-6" />
          <span>端末を変えるとデータに戻れないことを理解しました</span>
        </label>
        <button type="submit" className="w-full rounded-xl bg-sky-700 px-5 py-4 text-xl font-bold text-white">
          はじめる
        </button>
      </form>
    </main>
  );
}
