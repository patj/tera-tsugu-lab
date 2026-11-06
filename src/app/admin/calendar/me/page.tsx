// 自分の予定: 今日以降の自分の予定のリスト（スマートフォン向け。大きめの文字。spec.md §3.2、§8）
import Link from "next/link";
import { listMyEvents, type CalendarEventDetail } from "@/domain/calendar";
import { jst, jstDateString, todayJst } from "@/domain/core";
import { getCurrentStaff, getStaffActor } from "@/lib/staff-auth";
import { eventColor, longDate, timeLabel } from "../_components/lib";
import { CalendarHeader, MemorialLink, OfficiantIcon } from "../_components/parts";

const LIMIT = 100;

export default async function MyEventsPage() {
  const me = await getCurrentStaff();
  const actor = await getStaffActor();
  const today = todayJst();
  const events = await listMyEvents(actor, { from: jst(today), limit: LIMIT });

  const byDate = new Map<string, CalendarEventDetail[]>();
  for (const e of events) {
    const d = jstDateString(e.start) < today ? today : jstDateString(e.start);
    byDate.set(d, [...(byDate.get(d) ?? []), e]);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <CalendarHeader view="me" date={today} title="自分の予定" />
      <p className="flex items-center gap-2 text-lg">
        {me.isOfficiant && <OfficiantIcon />}
        {me.roleTitle} {me.name} さんの、今日からの予定
      </p>
      {events.length === 0 && <p className="text-lg text-stone-600">今日からの予定はありません。</p>}
      {[...byDate.entries()].map(([date, list]) => (
        <section key={date}>
          <h2 className={`sticky top-0 border-b border-stone-300 bg-background py-2 text-xl font-bold ${date === today ? "text-amber-800" : ""}`}>
            {date === today ? "今日 " : ""}
            {longDate(date)}
          </h2>
          <ul className="mt-2 space-y-3">
            {list.map((e) => (
              <li key={e.id}>
                <Link href={`/admin/calendar/events/${e.id}`} className={`block rounded border-l-8 px-4 py-3 ${eventColor(e)}`}>
                  <span className="block text-lg">{timeLabel(e, date)}</span>
                  <span className="block text-xl font-bold">{e.title}</span>
                  <span className="mt-1 block text-base">
                    {e.visibility === "private" ? "私的な予定" : e.category}
                    {e.visibility === "shared" && e.assignees.length > 1 && (
                      <>（{e.assignees.map((a) => `${a.roleTitle} ${a.name}`).join("、")}）</>
                    )}
                  </span>
                  {e.body && <span className="mt-1 block whitespace-pre-wrap text-base">{e.body}</span>}
                </Link>
                {e.memorialServiceId && (
                  <p className="mt-1 px-1 text-base">
                    <MemorialLink memorialServiceId={e.memorialServiceId} />
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {events.length === LIMIT && <p className="text-stone-600">先の予定は、月表示で確かめてください。</p>}
    </div>
  );
}
