// カレンダーの画面で共通に使う部品（Server Components）
import Link from "next/link";
import type { CalendarEvent, CalendarStaff } from "@/domain/calendar";
import { memorialServiceHref } from "./lib";

/** 法要の担当者（is_officiant）のアイコン */
export function OfficiantIcon({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      role="img"
      aria-label="法要の担当者"
      title="法要の担当者"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-purple-700 font-bold text-white ${
        size === "sm" ? "mr-0.5 h-4 w-4 text-[10px] align-[-2px]" : "h-6 w-6 text-xs"
      }`}
    >
      法
    </span>
  );
}

export function StaffName({ staff, short = false }: { staff: CalendarStaff; short?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {staff.isOfficiant && <OfficiantIcon />}
      <span>
        {!short && <span className="text-sm text-stone-500">{staff.roleTitle} </span>}
        {short ? staff.roleTitle : staff.name}
      </span>
    </span>
  );
}

export type ViewName = "day" | "week" | "month" | "me";

const VIEWS: { name: ViewName; label: string; href: (date: string) => string }[] = [
  { name: "day", label: "日", href: (d) => `/admin/calendar?date=${d}` },
  { name: "week", label: "週", href: (d) => `/admin/calendar/week?date=${d}` },
  { name: "month", label: "月", href: (d) => `/admin/calendar/month?month=${d.slice(0, 7)}` },
  { name: "me", label: "自分の予定", href: () => `/admin/calendar/me` },
];

/** 表示の切り替えと、前後への移動 */
export function CalendarHeader({
  view,
  date,
  title,
  prevHref,
  nextHref,
  todayHref,
  newHref,
}: {
  view: ViewName;
  date: string;
  title: string;
  prevHref?: string;
  nextHref?: string;
  todayHref?: string;
  newHref?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex overflow-hidden rounded border border-stone-300 bg-white" aria-label="表示の切り替え">
          {VIEWS.map((v) => (
            <Link
              key={v.name}
              href={v.href(date)}
              aria-current={v.name === view ? "page" : undefined}
              className={`border-r border-stone-300 px-4 py-2 last:border-r-0 ${
                v.name === view ? "bg-stone-800 font-bold text-white" : "hover:bg-stone-100"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <Link
          href={newHref ?? `/admin/calendar/events/new?date=${date}`}
          className="rounded bg-stone-800 px-4 py-2 font-medium text-white hover:bg-stone-700"
        >
          ＋ 予定を登録
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {prevHref && (
          <Link href={prevHref} className="rounded border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-100" aria-label="前へ">
            ◀
          </Link>
        )}
        {todayHref && (
          <Link href={todayHref} className="rounded border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-100">
            今日
          </Link>
        )}
        {nextHref && (
          <Link href={nextHref} className="rounded border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-100" aria-label="次へ">
            ▶
          </Link>
        )}
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600">
      <span className="inline-flex items-center gap-1">
        <OfficiantIcon /> 法要の担当者
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-4 w-4 rounded-sm border border-stone-400 bg-stone-200" /> 他の人の私的な予定（内容は本人だけが見られます）
      </span>
    </p>
  );
}

/** 予定のリンク先。内容を見られない予定（他人の私的な予定）はリンクしない */
export function eventHref(e: CalendarEvent): string | null {
  return e.kind === "detail" ? `/admin/calendar/events/${e.id}` : null;
}

export function MemorialLink({ memorialServiceId }: { memorialServiceId: string }) {
  return (
    <Link href={memorialServiceHref(memorialServiceId)} className="text-purple-800 underline">
      法要の詳細を見る
    </Link>
  );
}
