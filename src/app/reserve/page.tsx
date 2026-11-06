import Link from "next/link";
import { addDays, getDefaultTempleId, todayJst } from "@/domain/core";
import {
  PUBLIC_HORIZON_DAYS,
  getAvailability,
  listFacilities,
  parseDateOrNull,
  shortDateLabel,
} from "@/domain/facility";

/** 1 ページに出す日数 */
const PAGE_DAYS = 28;

function href(facility: string, start: string) {
  return `/reserve?${new URLSearchParams({ facility, start }).toString()}`;
}

export default async function ReserveAvailabilityPage({ searchParams }: PageProps<"/reserve">) {
  const sp = await searchParams;
  const templeId = await getDefaultTempleId();
  const facilities = await listFacilities(templeId);
  const facility = facilities.find((f) => f.id === sp.facility) ?? facilities[0];
  const today = todayJst();
  const lastDay = addDays(today, PUBLIC_HORIZON_DAYS);
  let start = parseDateOrNull(sp.start) ?? today;
  if (start < today) start = today;
  if (start > lastDay) start = lastDay;
  const end = addDays(start, PAGE_DAYS - 1) > lastDay ? lastDay : addDays(start, PAGE_DAYS - 1);

  if (!facility) return <p>施設が登録されていません。</p>;
  const a = await getAvailability({ from: start, to: end, templeId, facilityIds: [facility.id] });
  const days = a.facilities[0]?.days ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">空き状況</h1>
      <p className="text-base text-stone-700">
        ◯ は空き、× は予約が入っている（申請中を含む）時間帯です。午前は正午まで、午後は正午からです。
        ◯ を押すと、その日の申請に進めます。
      </p>

      <nav className="flex flex-wrap gap-2" aria-label="施設">
        {facilities.map((f) => (
          <Link
            key={f.id}
            href={href(f.id, start)}
            className={`rounded-full border px-4 py-2 ${f.id === facility.id ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white"}`}
          >
            {f.name}
          </Link>
        ))}
      </nav>

      <div className="flex items-center justify-between gap-2">
        {start > today ? (
          <Link href={href(facility.id, addDays(start, -PAGE_DAYS) < today ? today : addDays(start, -PAGE_DAYS))} className="whitespace-nowrap rounded border border-stone-300 bg-white px-3 py-2">
            ← 前へ
          </Link>
        ) : (
          <span />
        )}
        <span className="text-base text-stone-600">
          {shortDateLabel(start)}〜{shortDateLabel(end)}
        </span>
        {end < lastDay ? (
          <Link href={href(facility.id, addDays(end, 1))} className="whitespace-nowrap rounded border border-stone-300 bg-white px-3 py-2">
            次へ →
          </Link>
        ) : (
          <span />
        )}
      </div>

      <table className="w-full border-collapse overflow-hidden rounded bg-white text-center">
        <caption className="sr-only">{facility.name}の空き状況</caption>
        <thead>
          <tr className="bg-stone-100">
            <th className="border border-stone-200 px-2 py-2 text-left">{facility.name}</th>
            <th className="w-24 border border-stone-200 px-2 py-2">午前</th>
            <th className="w-24 border border-stone-200 px-2 py-2">午後</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date} className={d.weekday === 0 || d.weekday === 6 ? "bg-stone-50" : ""}>
              <th
                className={`border border-stone-200 px-2 py-2 text-left font-normal ${d.weekday === 0 ? "text-red-700" : d.weekday === 6 ? "text-sky-800" : ""}`}
              >
                {shortDateLabel(d.date)}
              </th>
              {(["am", "pm"] as const).map((slot) => (
                <td key={slot} className="border border-stone-200 p-0 text-2xl">
                  {d.available[slot] && d.date > today ? (
                    <Link
                      href={`/reserve/apply?${new URLSearchParams({ facility: facility.id, date: d.date, period: slot }).toString()}`}
                      className="block py-2 text-emerald-700 hover:bg-emerald-50"
                      aria-label={`${shortDateLabel(d.date)} ${slot === "am" ? "午前" : "午後"} 空き。申請する`}
                    >
                      ◯
                    </Link>
                  ) : d.available[slot] ? (
                    <span className="block py-2 text-emerald-700" aria-label="空き（当日はお電話で）">
                      ◯
                    </span>
                  ) : (
                    <span className="block py-2 text-stone-400" aria-label="予約あり">
                      ×
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-base text-stone-600">当日のご利用や、ご不明な点は、お寺にお電話でお問い合わせください。</p>
    </div>
  );
}
