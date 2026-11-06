// 予定の詳細と編集。他人の私的な予定はドメイン層が notFound にするので、この画面には来ない
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvent } from "@/domain/calendar";
import { isDomainError, jstDateString, jstTimeString, listStaff } from "@/domain/core";
import { getCurrentStaff, getStaffActor } from "@/lib/staff-auth";
import { longDate, timeLabel } from "../../_components/lib";
import { CancelEventButton, EventForm } from "../../_components/event-form";
import { MemorialLink, OfficiantIcon } from "../../_components/parts";

async function load(eventId: string) {
  try {
    return await getEvent(await getStaffActor(), eventId);
  } catch (e) {
    if (isDomainError(e) && e.code === "not_found") notFound();
    throw e;
  }
}

export default async function EventPage({ params }: PageProps<"/admin/calendar/events/[eventId]">) {
  const { eventId } = await params;
  const me = await getCurrentStaff();
  const event = await load(eventId);
  const staff = await listStaff(me.templeId);
  const date = jstDateString(event.start);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p>
        <Link href={`/admin/calendar?date=${date}`} className="underline">
          ← カレンダーに戻る
        </Link>
      </p>
      <div>
        <p className="text-stone-600">
          {event.visibility === "private" ? "私的な予定（内容は自分だけが見られます）" : "業務の予定"}・{event.category}
        </p>
        <h1 className="text-2xl font-bold">{event.title}</h1>
        <p className="mt-1 text-lg">
          {longDate(date)} {timeLabel(event, date)}
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {event.assignees.map((a) => (
            <li key={a.staffId} className="inline-flex items-center gap-1.5">
              {a.isOfficiant && <OfficiantIcon />}
              <span className="text-sm text-stone-500">{a.roleTitle}</span> {a.name}
            </li>
          ))}
        </ul>
        {event.body && <p className="mt-3 whitespace-pre-wrap rounded bg-white px-3 py-2">{event.body}</p>}
        {event.memorialServiceId && (
          <p className="mt-3">
            <MemorialLink memorialServiceId={event.memorialServiceId} />
          </p>
        )}
      </div>

      {event.canEdit ? (
        <>
          <h2 className="border-t border-stone-200 pt-6 text-xl font-bold">予定を直す</h2>
          <EventForm
            eventId={event.id}
            staff={staff}
            currentStaffId={me.id}
            initial={{
              visibility: event.visibility,
              category: event.category,
              title: event.title,
              body: event.body ?? "",
              startDate: jstDateString(event.start),
              startTime: jstTimeString(event.start),
              endDate: jstDateString(event.end),
              endTime: jstTimeString(event.end),
              assigneeStaffIds: event.assignees.map((a) => a.staffId),
            }}
          />
          <div className="border-t border-stone-200 pt-6">
            <CancelEventButton eventId={event.id} />
          </div>
        </>
      ) : (
        <p className="rounded bg-stone-100 px-3 py-2 text-stone-700">法要の予定は、法要の画面から変更・取り消しします。</p>
      )}
    </div>
  );
}
