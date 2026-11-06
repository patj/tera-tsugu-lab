// 日表示: 縦軸が時間、横軸がスタッフの横並び（spec.md §3.2）
import Link from "next/link";
import { DAY_END_HOUR, DAY_START_HOUR, eventStaffIds, getCalendar, type CalendarEvent } from "@/domain/calendar";
import { addDays, jst, todayJst } from "@/domain/core";
import { getStaffActor } from "@/lib/staff-auth";
import { dateParam, eventColor, eventTitle, longDate, timeLabel } from "./_components/lib";
import { CalendarHeader, eventHref, Legend, StaffName } from "./_components/parts";

const HOUR_PX = 56;
const HOURS = DAY_END_HOUR - DAY_START_HOUR;

type Placed = { event: CalendarEvent; top: number; height: number; lane: number; lanes: number };

/** 1 人の列の中で、重なる予定を横に並べる */
function layoutColumn(events: CalendarEvent[], date: string): { placed: Placed[]; outside: CalendarEvent[] } {
  const rangeStart = jst(date, `${String(DAY_START_HOUR).padStart(2, "0")}:00`).getTime();
  const rangeEnd = jst(date, `${String(DAY_END_HOUR).padStart(2, "0")}:00`).getTime();
  const outside: CalendarEvent[] = [];
  const inside: { event: CalendarEvent; s: number; e: number }[] = [];
  for (const ev of events) {
    const s = Math.max(ev.start.getTime(), rangeStart);
    const e = Math.min(ev.end.getTime(), rangeEnd);
    if (s >= e) outside.push(ev);
    else inside.push({ event: ev, s, e });
  }
  inside.sort((a, b) => a.s - b.s || b.e - a.e);

  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const closeCluster = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const item of inside) {
    if (item.s >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= item.s);
    if (lane < 0) lane = laneEnds.push(item.e) - 1;
    else laneEnds[lane] = item.e;
    clusterEnd = Math.max(clusterEnd, item.e);
    const p: Placed = {
      event: item.event,
      top: ((item.s - rangeStart) / 3_600_000) * HOUR_PX,
      height: Math.max(((item.e - item.s) / 3_600_000) * HOUR_PX, 22),
      lane,
      lanes: 1,
    };
    cluster.push(p);
    placed.push(p);
  }
  closeCluster();
  return { placed, outside };
}

function EventBlock({ p, date }: { p: Placed; date: string }) {
  const href = eventHref(p.event);
  const style = {
    top: p.top,
    height: p.height,
    left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
    width: `calc(${100 / p.lanes}% - 4px)`,
  };
  const className = `absolute overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-sm leading-snug shadow-sm ${eventColor(p.event)}`;
  const content = (
    <>
      <span className="block text-xs">{timeLabel(p.event, date)}</span>
      <span className="block font-medium">{eventTitle(p.event)}</span>
    </>
  );
  return href ? (
    <Link href={href} className={`${className} hover:brightness-95`} style={style}>
      {content}
    </Link>
  ) : (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

export default async function DayViewPage({ searchParams }: PageProps<"/admin/calendar">) {
  const date = dateParam((await searchParams).date);
  const actor = await getStaffActor();
  const view = await getCalendar(actor, { from: jst(date), to: jst(addDays(date, 1)) });
  const hours = Array.from({ length: HOURS }, (_, i) => DAY_START_HOUR + i);

  const columns = view.staff.map((s) => ({
    staff: s,
    ...layoutColumn(
      view.events.filter((e) => eventStaffIds(e).includes(s.id)),
      date,
    ),
  }));
  const hasOutside = columns.some((c) => c.outside.length > 0);

  return (
    <div className="space-y-4">
      <CalendarHeader
        view="day"
        date={date}
        title={longDate(date)}
        prevHref={`/admin/calendar?date=${addDays(date, -1)}`}
        nextHref={`/admin/calendar?date=${addDays(date, 1)}`}
        todayHref={`/admin/calendar?date=${todayJst()}`}
      />
      <Legend />
      <div className="overflow-x-auto rounded border border-stone-200 bg-white">
        <div className="min-w-max">
          {/* スタッフの見出し */}
          <div className="sticky top-0 z-10 flex border-b border-stone-200 bg-white">
            <div className="w-14 shrink-0" />
            {columns.map((c) => (
              <div key={c.staff.id} className="w-40 shrink-0 border-l border-stone-200 px-2 py-2 font-medium">
                <StaffName staff={c.staff} />
              </div>
            ))}
          </div>
          {/* 範囲（6:00〜21:00）の外の予定 */}
          {hasOutside && (
            <div className="flex border-b border-stone-200 bg-stone-50">
              <div className="w-14 shrink-0 px-1 py-1 text-xs text-stone-500">範囲外</div>
              {columns.map((c) => (
                <div key={c.staff.id} className="w-40 shrink-0 space-y-1 border-l border-stone-200 p-1">
                  {c.outside.map((e, i) => {
                    const href = eventHref(e);
                    const body = (
                      <>
                        <span className="block text-xs">{timeLabel(e, date)}</span>
                        <span className="block font-medium">{eventTitle(e)}</span>
                      </>
                    );
                    const cls = `block rounded border-l-4 px-1.5 py-0.5 text-sm ${eventColor(e)}`;
                    return href ? (
                      <Link key={i} href={href} className={cls}>
                        {body}
                      </Link>
                    ) : (
                      <div key={i} className={cls}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {/* 時間の軸と予定 */}
          <div className="flex">
            <div className="w-14 shrink-0">
              {hours.map((h) => (
                <div key={h} style={{ height: HOUR_PX }} className="border-b border-stone-100 pr-2 text-right text-sm text-stone-500">
                  {h}:00
                </div>
              ))}
            </div>
            {columns.map((c) => (
              <div key={c.staff.id} className="relative w-40 shrink-0 border-l border-stone-200" style={{ height: HOURS * HOUR_PX }}>
                {hours.map((h) => (
                  <Link
                    key={h}
                    href={`/admin/calendar/events/new?date=${date}&start=${String(h).padStart(2, "0")}:00&staff=${c.staff.id}`}
                    aria-label={`${h}:00 に${c.staff.name}さんの予定を登録`}
                    style={{ height: HOUR_PX }}
                    className="block border-b border-stone-100 hover:bg-stone-50"
                  />
                ))}
                {c.placed.map((p, i) => (
                  <EventBlock key={i} p={p} date={date} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-sm text-stone-500">
        空いている時間をクリックすると、その時間の予定を登録できます。表示は {DAY_START_HOUR}:00〜{DAY_END_HOUR}:00 です。
      </p>
    </div>
  );
}
