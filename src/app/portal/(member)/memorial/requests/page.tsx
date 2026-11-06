// 法要の申し込みの状況（受付済み / 確定 / お断りと理由）。
// 窓口と can_view_household の家族は世帯のすべて、それ以外の家族は自分で申し込んだものだけ
import Link from "next/link";
import { listPortalMemorialRequests } from "@/domain/portal";
import { requirePortal } from "@/lib/portal-auth";
import { Card, DoneBox, PageTitle, StatusBadge, dateTimeLabel, locationLabel, periodLabel } from "../../../_components/ui";

export const metadata = { title: "法要の申し込みの状況 | 檀家ポータル" };

export default async function MemorialRequestsPage({ searchParams }: PageProps<"/portal/memorial/requests">) {
  const sp = await searchParams;
  const { actor, ctx } = await requirePortal();
  const list = await listPortalMemorialRequests(actor);

  return (
    <main>
      <PageTitle>法要の申し込みの状況</PageTitle>
      {sp.done && (
        <DoneBox>
          お申し込みを受け付けました。お寺で日にちと担当を決めて、確定したらこの画面と「家の法要の予定」に表示します。
        </DoneBox>
      )}
      {!ctx.can.viewHousehold && (
        <p className="mb-4 text-base text-stone-600">ご自分で申し込んだものだけを表示しています。</p>
      )}
      {list.length === 0 ? (
        <p className="rounded-xl bg-white px-5 py-4 text-stone-600">申し込みはまだありません。</p>
      ) : (
        <ul className="space-y-4">
          {list.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={r.status} />
                  <span className="text-sm text-stone-500">
                    {r.source === "phone" ? "お電話で受付" : `${r.requestedByName ?? ""} さんが申し込み`}
                  </span>
                </div>
                <p className="mt-3 text-xl font-bold">
                  {r.targets.map((t) => `${t.name} さま ${t.kaikiName}`).join("、")}
                </p>
                {r.targets.length > 1 && <p className="text-base text-stone-600">複数の故人をあわせて供養する</p>}
                {r.status === "scheduled" && r.service && (
                  <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-3">
                    <strong>{dateTimeLabel(r.service.startAt)}</strong>
                    <br />
                    場所: {locationLabel(r.service.location)} ／ 担当: {r.service.officiantName}
                  </p>
                )}
                {r.status === "declined" && (
                  <p className="mt-3 rounded-lg bg-stone-100 px-4 py-3">
                    お断りの理由: {r.declineReason ?? "（お寺からご連絡します）"}
                  </p>
                )}
                {r.status === "requested" && (
                  <p className="mt-3 text-base text-stone-700">お寺で日にちを調整しています。確定したらこちらに表示します。</p>
                )}
                <details className="mt-3 text-base">
                  <summary className="cursor-pointer text-stone-600 underline">申し込みの内容</summary>
                  <ul className="mt-2 space-y-1">
                    {r.preferredPeriods.map((p, i) => (
                      <li key={i}>
                        第 {i + 1} 希望: {periodLabel(p)}
                      </li>
                    ))}
                    <li>場所: {locationLabel(r.location)}</li>
                  </ul>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {ctx.can.applyMemorial && (
        <Link href="/portal/memorial/apply" className="mt-8 block rounded-xl bg-stone-800 px-4 py-4 text-center text-xl font-bold text-white">
          法要を申し込む
        </Link>
      )}
    </main>
  );
}
