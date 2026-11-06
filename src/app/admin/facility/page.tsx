import Link from "next/link";
import { jst, todayJst } from "@/domain/core";
import { formatRange, listReservations, type ReservationStatus } from "@/domain/facility";
import { getCurrentStaff } from "@/lib/staff-auth";
import { FacilityTabs, KindBadge, StatusBadge } from "./ui";

const FILTERS = {
  upcoming: { label: "今後の予約", statuses: ["pending", "confirmed"] as ReservationStatus[], fromToday: true },
  pending: { label: "承認待ち", statuses: ["pending"] as ReservationStatus[], fromToday: false },
  all: { label: "すべて（過去、お断り、取り消しを含む）", statuses: [] as ReservationStatus[], fromToday: false },
} as const;
type FilterKey = keyof typeof FILTERS;

export default async function FacilityListPage({ searchParams }: PageProps<"/admin/facility">) {
  const staff = await getCurrentStaff();
  const { show } = await searchParams;
  const key: FilterKey = typeof show === "string" && show in FILTERS ? (show as FilterKey) : "upcoming";
  const filter = FILTERS[key];
  const list = await listReservations(staff.templeId, {
    statuses: filter.statuses,
    from: filter.fromToday ? jst(todayJst()) : undefined,
  });
  const pendingCount = list.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">施設予約</h1>
        <FacilityTabs />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
          <Link
            key={k}
            href={k === "upcoming" ? "/admin/facility" : `/admin/facility?show=${k}`}
            className={`rounded-full border px-4 py-1.5 ${k === key ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white"}`}
          >
            {FILTERS[k].label}
          </Link>
        ))}
      </div>

      {pendingCount > 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-lg">
          承認待ちの申請が <strong>{pendingCount} 件</strong> あります（上に並べています）。
        </p>
      )}

      {list.length === 0 ? (
        <p className="text-stone-600">予約はありません。</p>
      ) : (
        <div className="overflow-x-auto rounded border border-stone-200 bg-white">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b border-stone-200 bg-stone-50 text-sm text-stone-600">
              <tr>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2">日時</th>
                <th className="px-3 py-2">施設</th>
                <th className="px-3 py-2">種類</th>
                <th className="px-3 py-2">申請者・件名</th>
                <th className="px-3 py-2">申請番号</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className={`border-b border-stone-100 last:border-0 ${r.status === "pending" ? "bg-amber-50/50" : ""}`}>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/admin/facility/${r.id}`} className="underline">
                      {formatRange(r.start, r.end)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.facilityName}</td>
                  <td className="px-3 py-2">
                    <KindBadge kind={r.kind} />
                  </td>
                  <td className="px-3 py-2">
                    {r.partyName && <div>{r.partyName}</div>}
                    {r.title && <div className="text-sm text-stone-600">{r.title}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-sm">{r.requestCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
