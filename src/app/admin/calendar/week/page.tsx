// 週表示: 行がスタッフ、列が曜日（spec.md §3.2）
import Link from "next/link";
import { eventStaffIds, getCalendar } from "@/domain/calendar";
import { addDays, eachDate, jst, todayJst } from "@/domain/core";
import { getStaffActor } from "@/lib/staff-auth";
import { dateParam, eventColor, eventTitle, onDay, shortDate, timeLabel, weekdayOf, weekStart } from "../_components/lib";
import { CalendarHeader, eventHref, Legend, StaffName } from "../_components/parts";

export default async function WeekViewPage({ searchParams }: PageProps<"/admin/calendar/week">) {
  const date = dateParam((await searchParams).date);
  const start = weekStart(date);
  const days = eachDate(start, addDays(start, 6));
  const actor = await getStaffActor();
  const view = await getCalendar(actor, { from: jst(start), to: jst(addDays(start, 7)) });
  const today = todayJst();

  return (
    <div className="space-y-4">
      <CalendarHeader
        view="week"
        date={date}
        title={`${shortDate(days[0])} 〜 ${shortDate(days[6])}`}
        prevHref={`/admin/calendar/week?date=${addDays(start, -7)}`}
        nextHref={`/admin/calendar/week?date=${addDays(start, 7)}`}
        todayHref={`/admin/calendar/week?date=${today}`}
      />
      <Legend />
      <div className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="w-full min-w-[60rem] table-fixed border-collapse">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="w-40 px-2 py-2 text-left font-medium">スタッフ</th>
              {days.map((d) => {
                const wd = weekdayOf(d);
                return (
                  <th
                    key={d}
                    className={`border-l border-stone-200 px-2 py-2 text-left font-medium ${d === today ? "bg-amber-50" : ""} ${
                      wd === 0 ? "text-red-700" : wd === 6 ? "text-blue-700" : ""
                    }`}
                  >
                    <Link href={`/admin/calendar?date=${d}`} className="hover:underline">
                      {shortDate(d)}
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.staff.map((s) => {
              const mine = view.events.filter((e) => eventStaffIds(e).includes(s.id));
              return (
                <tr key={s.id} className="border-b border-stone-200 align-top">
                  <th scope="row" className="px-2 py-2 text-left font-medium">
                    <StaffName staff={s} />
                  </th>
                  {days.map((d) => (
                    <td key={d} className={`border-l border-stone-200 p-1 ${d === today ? "bg-amber-50/50" : ""}`}>
                      <ul className="space-y-1">
                        {mine
                          .filter((e) => onDay(e, d))
                          .map((e, i) => {
                            const href = eventHref(e);
                            const body = (
                              <>
                                <span className="block text-xs">{timeLabel(e, d)}</span>
                                <span className="block text-sm font-medium leading-snug">{eventTitle(e)}</span>
                              </>
                            );
                            const cls = `block rounded border-l-4 px-1.5 py-0.5 ${eventColor(e)}`;
                            return (
                              <li key={i}>
                                {href ? (
                                  <Link href={href} className={`${cls} hover:brightness-95`}>
                                    {body}
                                  </Link>
                                ) : (
                                  <div className={cls}>{body}</div>
                                )}
                              </li>
                            );
                          })}
                      </ul>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
