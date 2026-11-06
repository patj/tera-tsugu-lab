// 予定の登録
import Link from "next/link";
import { addMinutes, jst, jstDateString, jstTimeString, listStaff, parseHHMM } from "@/domain/core";
import { getCurrentStaff } from "@/lib/staff-auth";
import { dateParam } from "../../_components/lib";
import { EventForm } from "../../_components/event-form";

function timeParam(v: string | string[] | undefined): string {
  const s = typeof v === "string" ? v : "";
  try {
    parseHHMM(s);
    return s.padStart(5, "0");
  } catch {
    return "10:00";
  }
}

export default async function NewEventPage({ searchParams }: PageProps<"/admin/calendar/events/new">) {
  const sp = await searchParams;
  const me = await getCurrentStaff();
  const staff = await listStaff(me.templeId);
  const date = dateParam(sp.date);
  const startTime = timeParam(sp.start);
  const end = addMinutes(jst(date, startTime), 60);
  const staffId = typeof sp.staff === "string" && staff.some((s) => s.id === sp.staff) ? sp.staff : me.id;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p>
        <Link href={`/admin/calendar?date=${date}`} className="underline">
          ← カレンダーに戻る
        </Link>
      </p>
      <h1 className="text-2xl font-bold">予定を登録</h1>
      <EventForm
        staff={staff}
        currentStaffId={me.id}
        initial={{
          visibility: "shared",
          category: "その他",
          title: "",
          body: "",
          startDate: date,
          startTime,
          endDate: jstDateString(end),
          endTime: jstTimeString(end),
          assigneeStaffIds: [staffId],
        }}
      />
    </div>
  );
}
