// 施設の空き状況（◯×だけ。予約の内容は見えない）。施設の申請はハッカソン版では公開ページ（/reserve）から
import Link from "next/link";
import { addDays, todayJst } from "@/domain/core";
import { PORTAL_AVAILABILITY_DAYS, getPortalAvailability } from "@/domain/portal";
import { requirePortal } from "@/lib/portal-auth";
import { PageTitle } from "../../_components/ui";

export const metadata = { title: "施設の空き状況 | 檀家ポータル" };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function shortDate(date: string, weekday: number) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}（${WEEKDAYS[weekday]}）`;
}

function href(facility: string, start: string) {
  return `/portal/facility?${new URLSearchParams({ facility, start }).toString()}`;
}

export default async function FacilityPage({ searchParams }: PageProps<"/portal/facility">) {
  const sp = await searchParams;
  const { actor } = await requirePortal();
  const today = todayJst();
  const a = await getPortalAvailability(actor, { start: typeof sp.start === "string" ? sp.start : undefined, today });
  const facility = a.facilities.find((f) => f.id === sp.facility) ?? a.facilities[0];

  return (
    <main>
      <PageTitle>施設の空き状況</PageTitle>
      <p className="mb-4 text-base text-stone-700">◯ は空き、× は予約が入っている（申請中を含む）時間帯です。午前は正午まで、午後は正午からです。</p>
      {!facility ? (
        <p>施設が登録されていません。</p>
      ) : (
        <>
          <nav className="mb-4 flex flex-wrap gap-2" aria-label="施設">
            {a.facilities.map((f) => (
              <Link
                key={f.id}
                href={href(f.id, a.from)}
                className={`rounded-full border px-4 py-2 ${f.id === facility.id ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white"}`}
              >
                {f.name}
              </Link>
            ))}
          </nav>
          <div className="mb-3 flex items-center justify-between">
            {a.from > today ? (
              <Link href={href(facility.id, addDays(a.from, -PORTAL_AVAILABILITY_DAYS))} className="rounded border border-stone-300 bg-white px-3 py-2">
                ← 前へ
              </Link>
            ) : (
              <span />
            )}
            <Link href={href(facility.id, addDays(a.to, 1))} className="rounded border border-stone-300 bg-white px-3 py-2">
              次へ →
            </Link>
          </div>
          <table className="w-full border-collapse overflow-hidden rounded bg-white text-center">
            <caption className="sr-only">{facility.name}の空き状況</caption>
            <thead>
              <tr className="bg-stone-100">
                <th className="border border-stone-200 px-2 py-2 text-left">{facility.name}</th>
                {a.slots.map((s) => (
                  <th key={s.key} className="w-24 border border-stone-200 px-2 py-2">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facility.days.map((d) => (
                <tr key={d.date} className={d.weekday === 0 || d.weekday === 6 ? "bg-stone-50" : ""}>
                  <th className={`border border-stone-200 px-2 py-2 text-left font-normal ${d.weekday === 0 ? "text-red-700" : d.weekday === 6 ? "text-sky-800" : ""}`}>
                    {shortDate(d.date, d.weekday)}
                  </th>
                  {a.slots.map((s) => (
                    <td key={s.key} className="border border-stone-200 py-2 text-2xl">
                      {d.available[s.key] ? (
                        <span className="text-emerald-700" aria-label="空き">◯</span>
                      ) : (
                        <span className="text-stone-400" aria-label="予約あり">×</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-base text-stone-600">
            施設のご利用の申請は、<Link href="/reserve" className="underline">施設のご利用のページ</Link>からお願いします。
          </p>
        </>
      )}
    </main>
  );
}
