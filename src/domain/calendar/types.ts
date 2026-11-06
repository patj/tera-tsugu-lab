// スタッフのカレンダー（calendar）の型と定数（spec.md §3.2）

/** 予定のカテゴリ */
export const EVENT_CATEGORIES = ["法要", "行事", "外出", "来客", "その他", "私用"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** 業務の予定で使えるカテゴリ（「私用」は私的な予定だけ） */
export const SHARED_EVENT_CATEGORIES = ["法要", "行事", "外出", "来客", "その他"] as const;
export type SharedEventCategory = (typeof SHARED_EVENT_CATEGORIES)[number];

/** private（私的。内容は本人だけ）/ shared（業務） */
export type EventVisibility = "private" | "shared";

/** 他人の私的な予定の代わりに見せる文言 */
export const BUSY_LABEL = "予定あり";

/** 日表示と週表示で見せる時間の範囲（日本時間。docs/tasks/02-calendar.md の【決定】） */
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 21;

/** 一度に読み込める期間の上限（日） */
export const MAX_RANGE_DAYS = 62;

export type EventAssignee = { staffId: string; name: string; roleTitle: string; isOfficiant: boolean };

/** 内容まで見られる予定（業務の予定、または自分の私的な予定） */
export type CalendarEventDetail = {
  kind: "detail";
  id: string;
  visibility: EventVisibility;
  category: EventCategory;
  title: string;
  body: string | null;
  start: Date;
  end: Date;
  ownerStaffId: string;
  memorialServiceId: string | null;
  assignees: EventAssignee[];
  /** 閲覧者が直せるか（法要にひもづく予定は、法要の画面から直す） */
  canEdit: boolean;
};

/**
 * 他人の私的な予定。時間と「予定あり」だけを持つ（ID、タイトル、内容、カテゴリは持たない）。
 * 私的な予定の担当者は本人 1 人なので、staffId は本人
 */
export type CalendarEventBusy = {
  kind: "busy";
  visibility: "private";
  staffId: string;
  label: typeof BUSY_LABEL;
  start: Date;
  end: Date;
};

export type CalendarEvent = CalendarEventDetail | CalendarEventBusy;

export type CalendarStaff = {
  id: string;
  name: string;
  roleTitle: string;
  isOfficiant: boolean;
  canLogin: boolean;
};

export type CalendarView = {
  staff: CalendarStaff[];
  /** 開始の順。業務の予定は担当者が複数でも 1 件 */
  events: CalendarEvent[];
};

/** 予定がどのスタッフの列に出るか */
export function eventStaffIds(e: CalendarEvent): string[] {
  return e.kind === "busy" ? [e.staffId] : e.assignees.map((a) => a.staffId);
}

export function isEventCategory(s: string): s is EventCategory {
  return (EVENT_CATEGORIES as readonly string[]).includes(s);
}
