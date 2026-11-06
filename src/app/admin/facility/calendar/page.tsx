import Link from "next/link";
import { addDays, jst, jstDateString, todayJst } from "@/domain/core";
import {
  WEEKDAY_LABELS,
  addMonths,
  listFacilities,
  listReservations,
  monthGridDates,
  monthStart,
  parseDateOrNull,
  shortDateLabel,
  weekStart,
  type Reservation,
} from "@/domain/facility";
import { getCurrentStaff } from "@/lib/staff-auth";
import { FacilityTabs, Legend, ReservationChip } from "../ui";

type View = "week" | "month";

function href(view: View, date: string, facility: string) {
  const q = new URLSearchParams({ view, date });
  if (facility !== "all") q.set("facility", facility);
  return `/admin/facility/calendar?${q.toString()}`;
}

function onDate(list: Reservation[], date: string) {
  return list.filter((r) => jstDateString(r.start) <= date && date <= jstDateString(new Date(r.end.getTime() - 1)));
}

const pill = (active: boolean) =>
  `rounded-full border px-4 py-1.5 ${active ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white hover:bg-stone-50"}`;

export default async function FacilityCalendarPage({ searchParams }: PageProps<"/admin/facility/calendar">) {
  const staff = await getCurrentStaff();
  const sp = await searchParams;
  const view: View = sp.view === "month" ? "month" : "week";
  const date = parseDateOrNull(sp.date) ?? todayJst();
  const today = todayJst();
  const facilities = await listFacilities(staff.templeId);
  const facility = typeof sp.facility === "string" && facilities.some((f) => f.id === sp.facility) ? sp.facility : "all";
  const shown = facility === "all" ? facilities : facilities.filter((f) => f.id === facility);

  const dates =
    view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i)) : monthGridDates(date);
  const list = await listReservations(staff.templeId, {
    statuses: ["pending", "confirmed"],
    facilityId: facility === "all" ? undefined : facility,
    from: jst(dates[0]),
    to: jst(addDays(dates[dates.length - 1], 1)),
  });
  // 一覧は承認待ちを先頭に並べるので、カレンダーでは時刻の順に並べ直す
  list.sort((a, b) => a.start.getTime() - b.start.getTime());

  const prev = view === "week" ? addDays(weekStart(date), -7) : addMonths(date, -1);
  const next = view === "week" ? addDays(weekStart(date), 7) : addMonths(date, 1);
  const title =
    view === "week"
      ? `${shortDateLabel(dates[0])}〜${shortDateLabel(dates[6])}`
      : `${monthStart(date).slice(0, 4)}年${Number(monthStart(date).slice(5, 7))}月`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">施設のカレンダー</h1>
        <FacilityTabs />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={href("week", date, facility)} className={pill(view === "week")}>
          週
        </Link>
        <Link href={href("month", date, facility)} className={pill(view === "month")}>
          月
        </Link>
        <span className="mx-2 h-6 w-px bg-stone-300" />
        <Link href={href(view, date, "all")} className={pill(facility === "all")}>
          すべての施設
        </Link>
        {facilities.map((f) => (
          <Link key={f.id} href={href(view, date, f.id)} className={pill(facility === f.id)}>
            {f.name}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={href(view, prev, facility)} className="rounded border border-stone-300 bg-white px-3 py-1.5">
          ← {view === "week" ? "前の週" : "前の月"}
        </Link>
        <Link href={href(view, today, facility)} className="rounded border border-stone-300 bg-white px-3 py-1.5">
          今日
        </Link>
        <Link href={href(view, next, facility)} className="rounded border border-stone-300 bg-white px-3 py-1.5">
          {view === "week" ? "次の週" : "次の月"} →
        </Link>
        <h2 className="text-xl font-bold">{title}</h2>
      </div>

      <Legend />

      {view === "week" ? (
        <div className="overflow-x-auto rounded border border-stone-200 bg-white">
          <table className="w-full min-w-[900px] table-fixed border-collapse">
            <thead>
              <tr className="bg-stone-50 text-sm">
                <th className="w-20 border-b border-stone-200 px-2 py-2 text-left">施設</th>
                {dates.map((d, i) => (
                  <th
                    key={d}
                    className={`border-b border-l border-stone-200 px-2 py-2 text-left ${d === today ? "bg-amber-100" : ""} ${i === 5 ? "text-sky-800" : i === 6 ? "text-red-700" : ""}`}
                  >
                    <Link href={`/admin/facility/new?date=${d}`} className="hover:underline" title="この日に予約を登録する">
                      {shortDateLabel(d)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => (
                <tr key={f.id} className="align-top">
                  <th className="border-b border-stone-200 px-2 py-2 text-left font-medium">{f.name}</th>
                  {dates.map((d) => (
                    <td key={d} className={`h-20 border-b border-l border-stone-200 p-1 ${d === today ? "bg-amber-50" : ""}`}>
                      <div className="space-y-1">
                        {onDate(
                          list.filter((r) => r.facilityId === f.id),
                          d,
                        ).map((r) => (
                          <ReservationChip key={r.id} r={r} />
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-stone-200 bg-white">
          <div className="grid min-w-[900px] grid-cols-7">
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
              <div
                key={wd}
                className={`border-b border-stone-200 bg-stone-50 px-2 py-1 text-sm font-bold ${wd === 6 ? "text-sky-800" : wd === 0 ? "text-red-700" : ""}`}
              >
                {WEEKDAY_LABELS[wd]}
              </div>
            ))}
            {dates.map((d) => {
              const inMonth = d.slice(0, 7) === date.slice(0, 7);
              return (
                <div
                  key={d}
                  className={`min-h-28 border-b border-l border-stone-100 p-1 ${inMonth ? "" : "bg-stone-50 text-stone-400"} ${d === today ? "bg-amber-50" : ""}`}
                >
                  <Link href={`/admin/facility/new?date=${d}`} className="text-sm hover:underline" title="この日に予約を登録する">
                    {Number(d.slice(8))}
                  </Link>
                  <div className="mt-1 space-y-1">
                    {onDate(list, d).map((r) => (
                      <ReservationChip key={r.id} r={r} showFacility={facility === "all"} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
