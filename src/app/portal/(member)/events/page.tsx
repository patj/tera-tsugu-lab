// 行事の一覧（受付中の members / both のフォーム）と、申し込みの確認（本人の分。窓口は世帯の分も）
import Link from "next/link";
import { listPortalEventResponses, listPortalEvents } from "@/domain/portal";
import type { MyResponse } from "@/domain/forms";
import { requirePortal } from "@/lib/portal-auth";
import { Card, DoneBox, PageTitle } from "../../_components/ui";

export const metadata = { title: "行事の申し込み | 檀家ポータル" };

export default async function EventsPage({ searchParams }: PageProps<"/portal/events">) {
  const sp = await searchParams;
  const { actor, ctx } = await requirePortal();
  const events = await listPortalEvents(actor);
  const responses = await listPortalEventResponses(actor);
  const others = responses.household?.filter((r) => !responses.mine.some((m) => m.id === r.id)) ?? [];

  return (
    <main>
      <PageTitle>行事の申し込み</PageTitle>
      {sp.done && <DoneBox>お申し込みを受け付けました。下の「ご自分の申し込み」で内容を確かめられます。</DoneBox>}

      <h2 className="mb-3 text-xl font-bold">受付中の行事</h2>
      {events.length === 0 ? (
        <p className="mb-8 rounded-xl bg-white px-5 py-4 text-stone-600">いま受け付けている行事はありません。</p>
      ) : (
        <ul className="mb-8 space-y-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/portal/events/${e.id}`} className="block rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm active:bg-stone-100">
                <span className="block text-xl font-bold">{e.title} →</span>
                {e.description && <span className="mt-1 block line-clamp-2 text-base text-stone-600">{e.description}</span>}
                {e.myResponseCount > 0 && (
                  <span className="mt-2 inline-block rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-900">申し込み済み（{e.myResponseCount} 件）</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 text-xl font-bold">ご自分の申し込み</h2>
      <ResponseList list={responses.mine} empty="まだ申し込みはありません。" />

      {ctx.can.viewHouseholdResponses && (
        <>
          <h2 className="mt-8 mb-3 text-xl font-bold">ご家族・家の申し込み</h2>
          <p className="mb-3 text-base text-stone-600">窓口の方には、ご家族の申し込みと、お寺からの個別のご案内から届いた申し込みも表示します。</p>
          <ResponseList list={others} empty="ほかの申し込みはありません。" />
        </>
      )}
    </main>
  );
}

function ResponseList({ list, empty }: { list: MyResponse[]; empty: string }) {
  if (list.length === 0) return <p className="rounded-xl bg-white px-5 py-4 text-stone-600">{empty}</p>;
  return (
    <ul className="space-y-3">
      {list.map((r) => (
        <li key={r.id}>
          <Card>
            <p className="text-lg font-bold">{r.formTitle}</p>
            <p className="text-sm text-stone-500">
              {r.createdAtLabel} {r.respondentName ? `／ ${r.respondentName}` : ""}
              {r.formStatus === "closed" && " ／ 締め切り済み"}
            </p>
            <dl className="mt-2 space-y-1 text-base">
              {r.items.map((it, i) => (
                <div key={i}>
                  <dt className="inline font-bold">{it.label}: </dt>
                  <dd className="inline whitespace-pre-wrap">{it.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </li>
      ))}
    </ul>
  );
}
