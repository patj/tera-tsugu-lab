// 家の法要の予定（確定した法要と、今後の年忌の目安）。窓口、または can_view_household の家族
import Link from "next/link";
import { getPortalMemorialSchedule } from "@/domain/portal";
import { requirePortal } from "@/lib/portal-auth";
import { Card, Forbidden, PageTitle, dateLabel, dateTimeLabel, locationLabel } from "../../_components/ui";

export const metadata = { title: "家の法要の予定 | 檀家ポータル" };

export default async function MemorialSchedulePage() {
  const { actor, ctx } = await requirePortal();
  if (!ctx.can.viewHousehold) return <Forbidden contactName={ctx.contactName} />;
  const s = await getPortalMemorialSchedule(actor);

  return (
    <main>
      <PageTitle>{s.householdName}の法要の予定</PageTitle>

      <h2 className="mb-3 text-xl font-bold">確定した法要</h2>
      {s.confirmed.length === 0 ? (
        <p className="mb-6 rounded-xl bg-white px-5 py-4 text-stone-600">確定した法要はまだありません。</p>
      ) : (
        <ul className="mb-6 space-y-3">
          {s.confirmed.map((c) => (
            <li key={c.id}>
              <Card className="border-emerald-300">
                <p className="text-xl font-bold">{dateTimeLabel(c.startAt)}</p>
                <p className="mt-1">
                  {c.targets.map((t) => `${t.name} さま ${t.kaikiName}`).join("、")}
                  {c.targets.length > 1 && <span className="ml-1 text-base text-stone-600">（複数の故人をあわせて供養する）</span>}
                </p>
                <p className="mt-1 text-base text-stone-700">
                  場所: {locationLabel(c.location)} ／ 担当: {c.officiantName}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 text-xl font-bold">これからの年忌の目安</h2>
      {s.upcoming.length === 0 ? (
        <p className="rounded-xl bg-white px-5 py-4 text-stone-600">この先 3 年のうちに迎える年忌はありません。</p>
      ) : (
        <ul className="space-y-3">
          {s.upcoming.map((u) => (
            <li key={`${u.personId}-${u.kaiki}`}>
              <Card>
                <p className="text-xl font-bold">
                  {u.year} 年 {u.relation ? `${u.relation}・` : ""}
                  {u.name.split(" ")[1] ?? u.name} さま {u.kaikiName}
                </p>
                <p className="mt-1 text-base text-stone-700">
                  祥月命日: {dateLabel(u.meinichi)}
                  {u.homyo && <span className="ml-2">（{u.homyo}）</span>}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-base text-stone-600">年忌法要は、祥月命日より前の日に営むのが一般的です。</p>

      {ctx.can.applyMemorial && (
        <Link href="/portal/memorial/apply" className="mt-8 block rounded-xl bg-stone-800 px-4 py-4 text-center text-xl font-bold text-white">
          法要を申し込む
        </Link>
      )}
      <Link href="/portal/memorial/requests" className="mt-4 block text-center underline">
        申し込みの状況を見る
      </Link>
    </main>
  );
}
