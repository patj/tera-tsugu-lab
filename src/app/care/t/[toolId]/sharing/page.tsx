// お寺との共有の設定（ツール単位。いつでもやめられる。変更の履歴を見せる）
import { formatJst } from "@/domain/core";
import { getCareConsent, listMyCareConsentHistory } from "@/domain/care";
import { requireCareSession } from "@/lib/care-auth";
import { setCareSharingAction } from "../../../actions";
import { loadCareTool } from "../../../_components/tool";
import { DoneBox, ErrorBox, PageTitle, SharedBadge, ToolTabs } from "../../../_components/ui";

export default async function CareSharingPage({ params, searchParams }: PageProps<"/care/t/[toolId]/sharing">) {
  const { actor } = await requireCareSession();
  const { toolId, manifest } = loadCareTool((await params).toolId);
  const sp = await searchParams;
  const shared = await getCareConsent(actor, toolId);
  const history = await listMyCareConsentHistory(actor, toolId);
  const action = setCareSharingAction.bind(null, toolId);
  return (
    <main>
      <PageTitle>
        <span aria-hidden className="mr-2">
          {manifest.icon}
        </span>
        {manifest.name}
      </PageTitle>
      <ToolTabs manifest={manifest} current="sharing" />
      <ErrorBox message={sp.error} />
      {sp.done === "shared" && <DoneBox>お寺と共有するようにしました。</DoneBox>}
      {sp.done === "stopped" && <DoneBox>共有をやめました。お寺の方からは、もう見えません。</DoneBox>}

      <section className="rounded-xl border border-stone-200 bg-white px-5 py-4">
        <p className="flex items-center gap-3">
          <span className="font-bold">いまの設定</span>
          <SharedBadge shared={shared} />
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-6 text-base">
          <li>共有すると、お寺の方が、このツールの記録（共有する前の記録も含めて）を読めるようになります。ほかのツールの記録は見えません。</li>
          <li>お寺の方が記録を読むと、そのことが記録（監査ログ）に残ります。</li>
          <li>共有中に、とてもつらい気持ちが書かれていると、お寺の方にお知らせが届きます。</li>
          <li>共有はいつでもやめられます。やめると、すぐにお寺の方からは見えなくなります。</li>
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
  );
}
