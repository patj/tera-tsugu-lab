// 月表示: 月のカレンダー。スタッフで絞り込める（spec.md §3.2）
import Link from "next/link";
import { getCalendar, listOfficiants, type CalendarEvent, type CalendarStaff } from "@/domain/calendar";
import { addDays, eachDate, jst, jstTimeString, listStaff, todayJst } from "@/domain/core";
import { getStaffActor } from "@/lib/staff-auth";
import { addMonths, eventColor, eventTitle, monthParam, onDay, WEEKDAYS, weekStart } from "../_components/lib";
import { CalendarHeader, eventHref, Legend, OfficiantIcon } from "../_components/parts";

const MAX_PER_DAY = 4;

function who(e: CalendarEvent, staff: Map<string, CalendarStaff>): string {
  if (e.kind === "busy") return staff.get(e.staffId)?.roleTitle ?? "";
  return e.assignees.map((a) => a.roleTitle).join("・");
}

export default async function MonthViewPage({ searchParams }: PageProps<"/admin/calendar/month">) {
  const sp = await searchParams;
  const month = monthParam(sp.month);
  const staffParam = typeof sp.staff === "string" ? sp.staff : "";
  const actor = await getStaffActor();
  const allStaff = await listStaff(actor.templeId);
  const officiantIds = (await listOfficiants(actor.templeId)).map((s) => s.id);
  // 絞り込み: 1 人のスタッフ、または法要の担当者の全員（"officiants"）
  const staffIds =
    staffParam === "officiants" ? officiantIds : allStaff.some((s) => s.id === staffParam) ? [staffParam] : undefined;

  const first = `${month}-01`;
  const last = addDays(`${addMonths(month, 1)}-01`, -1);
  const gridStart = weekStart(first);
  const gridEnd = addDays(weekStart(last), 6);
  const days = eachDate(gridStart, gridEnd);
  const view = await getCalendar(actor, { from: jst(gridStart), to: jst(addDays(gridEnd, 1)), staffIds });
  const staffMap = new Map(allStaff.map((s) => [s.id, s]));
  const today = todayJst();
  const [y, m] = month.split("-").map(Number);
  const q = staffParam ? `&staff=${staffParam}` : "";

  return (
    <div className="space-y-4">
      <CalendarHeader
        view="month"
        date={first}
        title={`${y} 年 ${m} 月`}
        prevHref={`/admin/calendar/month?month=${addMonths(month, -1)}${q}`}
        nextHref={`/admin/calendar/month?month=${addMonths(month, 1)}${q}`}
        todayHref={`/admin/calendar/month?month=${today.slice(0, 7)}${q}`}
      />
      <form className="flex flex-wrap items-center gap-2" action="/admin/calendar/month">
        <input type="hidden" name="month" value={month} />
        <label htmlFor="staff" className="font-medium">
          スタッフ
        </label>
        <select id="staff" name="staff" defaultValue={staffParam} className="rounded border border-stone-300 bg-white px-3 py-2">
          <option value="">全員</option>
          <option value="officiants">法要の担当者の全員</option>
          {allStaff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.roleTitle} {s.name}
              {s.isOfficiant ? "（法要の担当者）" : ""}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded border border-stone-300 bg-white px-4 py-2 hover:bg-stone-100">
          絞り込む
        </button>
      </form>
      <Legend />
      <div className="overflow-x-auto">
        <div className="grid min-w-[56rem] grid-cols-7 border-l border-t border-stone-200 bg-white">
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
            <div
              key={wd}
              className={`border-b border-r border-stone-200 px-2 py-1 text-center text-sm font-medium ${
                wd === 0 ? "text-red-700" : wd === 6 ? "text-blue-700" : ""
              }`}
            >
              {WEEKDAYS[wd]}
            </div>
          ))}
          {days.map((d) => {
            const events = view.events.filter((e) => onDay(e, d));
            const inMonth = d.startsWith(month);
            return (
              <div
                key={d}
                className={`min-h-32 border-b border-r border-stone-200 p-1 ${inMonth ? "" : "bg-stone-50 text-stone-400"} ${
                  d === today ? "bg-amber-50" : ""
                }`}
              >
                <Link href={`/admin/calendar?date=${d}`} className="block px-1 text-sm font-medium hover:underline">
                  {Number(d.slice(8))}
                </Link>
                <ul className="space-y-0.5">
                  {events.slice(0, MAX_PER_DAY).map((e, i) => {
                    const href = eventHref(e);
                    const officiant = e.kind === "detail" ? e.assignees.some((a) => a.isOfficiant) : officiantIds.includes(e.staffId);
                    const body = (
                      <>
                        <span className="text-xs">{jstTimeString(e.start)} </span>
                        <span className="font-medium">{eventTitle(e)}</span>
                        <span className="block truncate text-xs">
                          {officiant && <OfficiantIcon size="sm" />}
                          {who(e, staffMap)}
                        </span>
                      </>
                    );
                    const cls = `block truncate rounded border-l-4 px-1 text-sm leading-snug ${eventColor(e)}`;
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
                  {events.length > MAX_PER_DAY && (
                    <li>
                      <Link href={`/admin/calendar?date=${d}`} className="px-1 text-xs text-stone-600 underline">
                        ほか {events.length - MAX_PER_DAY} 件
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      {staffIds && (
        <p className="flex items-center gap-2 text-sm text-stone-600">
          {staffParam === "officiants" ? (
            <>
              <OfficiantIcon /> 法要の担当者の予定だけを表示しています
            </>
          ) : (
            <>
              {staffMap.get(staffParam)?.isOfficiant && <OfficiantIcon />}
              {staffMap.get(staffParam)?.roleTitle} {staffMap.get(staffParam)?.name} さんの予定だけを表示しています
            </>
          )}
        </p>
      )}
    </div>
  );
}
