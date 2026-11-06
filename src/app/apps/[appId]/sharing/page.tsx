// お寺との共有の設定（アプリ単位。基盤の画面。いつでもやめられる。変更の履歴を見せる）
// 1 件ずつの共有のアプリ（sharing: "perDoc"）では、選んだ文書だけが見えることと、選んでいる件数を出す
// （文書の中身の形はアプリが決めるので、一覧は出さない。選ぶのはアプリの画面で行う）
import { notFound } from "next/navigation";
import { appSharesPerDoc, appUsesSharing } from "@/apps-sdk/types";
import { formatJst } from "@/domain/core";
import { countMySharedAppDocuments, getAppSharing, listMyAppSharingHistory } from "@/domain/apps";
import { requireAppSession } from "@/lib/apps-auth";
import { setAppSharingAction } from "../../actions";
import { FramedShell } from "../../_components/framed-shell";
import { BackLink, DoneBox, ErrorBox, SharedBadge, loadApp } from "../../_components/ui";

export default async function AppSharingPage({ params, searchParams }: PageProps<"/apps/[appId]/sharing">) {
  const { actor } = await requireAppSession(`/apps/${encodeURIComponent((await params).appId)}`);
  const { appId, manifest } = loadApp((await params).appId);
  if (!appUsesSharing(manifest)) notFound();
  const perDoc = appSharesPerDoc(manifest);
  const sp = await searchParams;
  const [shared, history, markedCount] = await Promise.all([
    getAppSharing(actor, appId),
    listMyAppSharingHistory(actor, appId),
    perDoc ? countMySharedAppDocuments(actor, appId) : Promise.resolve(0),
  ]);
  const action = setAppSharingAction.bind(null, appId);
  return (
    <FramedShell>
      <main>
        <BackLink href={`/apps/${encodeURIComponent(appId)}`}>{manifest.name} へ</BackLink>
        <h1 className="mb-6 text-2xl font-bold">お寺との共有</h1>
        <ErrorBox message={sp.error} />
        {sp.done === "shared" && <DoneBox>{perDoc ? "お寺と共有するようにしました。選んだものだけが、お寺の方に見えます。" : "お寺と共有するようにしました。"}</DoneBox>}
        {sp.done === "stopped" && <DoneBox>共有をやめました。お寺の方からは、もう見えません。</DoneBox>}

        <section className="rounded-xl border border-stone-200 bg-white px-5 py-4">
          <p className="flex items-center gap-3">
            <span className="font-bold">「{manifest.name}」の今の設定</span>
            <SharedBadge shared={shared} perDoc={perDoc} />
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-base">
            {perDoc ? (
              <>
                <li>
                  このアプリでは、<strong>アプリの画面で「お寺と共有する」を選んだものだけ</strong>を、お寺の方が読めるようになります（共有する前に選んだものも含みます）。選ばなかったものや、ほかのアプリのデータは見えません。
                </li>
                <li>今、選んでいるのは {markedCount} 件です。選ぶ・やめるのは、アプリの画面でできます。</li>
              </>
            ) : (
              <li>共有すると、お寺の方が、このアプリのデータ（共有する前のものも含めて）を読めるようになります。ほかのアプリのデータは見えません。</li>
            )}
            <li>お寺の方は読むだけで、直したり消したりはできません。読んだことは記録（監査ログ）に残ります。</li>
            <li>
              共有はいつでもやめられます。やめると、すぐにお寺の方からは{perDoc ? "、選んだものも含めて" : ""}見えなくなります。
            </li>
          </ul>
          <form action={action} className="mt-5">
            <input type="hidden" name="shared" value={shared ? "0" : "1"} />
            <button
              type="submit"
              className={`w-full rounded-xl px-5 py-4 text-xl font-bold ${shared ? "border border-stone-400 bg-white text-stone-800" : "bg-amber-600 text-white"}`}
            >
              {shared ? "共有をやめる" : "お寺と共有する"}
            </button>
          </form>
        </section>

        {history.length > 0 && (
          <section className="mt-6">
            <h2 className="font-bold">設定を変えた記録</h2>
            <ul className="mt-2 space-y-1 text-base text-stone-700">
              {history.map((h, i) => (
                <li key={i}>
                  {formatJst(h.changedAt)} {h.shared ? "共有した" : "共有をやめた"}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </FramedShell>
  );
}
