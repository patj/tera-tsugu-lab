// 法要の受付（memorial）の型と表示の言葉（spec.md §3、§3.1）

export const MEMORIAL_LOCATIONS = ["temple", "home", "grave"] as const;
/** temple（お寺。本堂を押さえる）/ home（自宅）/ grave（墓前） */
export type MemorialLocation = (typeof MEMORIAL_LOCATIONS)[number];

export const LOCATION_LABELS: Record<MemorialLocation, string> = {
  temple: "お寺（本堂）",
  home: "自宅",
  grave: "墓前",
};

export const REQUEST_STATUSES = ["requested", "scheduled", "declined"] as const;
export type MemorialRequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<MemorialRequestStatus, string> = {
  requested: "受付済み",
  scheduled: "確定",
  declined: "お断り",
};

export const REQUEST_SOURCES = ["portal", "phone"] as const;
export type MemorialRequestSource = (typeof REQUEST_SOURCES)[number];

export const REQUEST_SOURCE_LABELS: Record<MemorialRequestSource, string> = {
  portal: "ポータル",
  phone: "電話",
};

export const SERVICE_STATUSES = ["scheduled", "done", "cancelled"] as const;
export type MemorialServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_STATUS_LABELS: Record<MemorialServiceStatus, string> = {
  scheduled: "予定",
  done: "済み",
  cancelled: "取り消し",
};

/** お寺の内部（管理画面、MCP）での、複数の故人をあわせて営む年忌の呼び方 */
export const JOINT_SERVICE_LABEL = "複数霊位供養";

/** 希望の時期の件数の上限（第 1〜第 3 希望） */
export const MAX_PREFERRED_PERIODS = 3;

/** 1 回の法要で一緒に供養できる故人の上限 */
export const MAX_TARGETS = 10;

export function isMemorialLocation(s: unknown): s is MemorialLocation {
  return typeof s === "string" && (MEMORIAL_LOCATIONS as readonly string[]).includes(s);
}

export function locationLabel(s: string): string {
  return isMemorialLocation(s) ? LOCATION_LABELS[s] : s;
}

export function requestStatusLabel(s: string): string {
  return (REQUEST_STATUS_LABELS as Record<string, string>)[s] ?? s;
}

export function serviceStatusLabel(s: string): string {
  return (SERVICE_STATUS_LABELS as Record<string, string>)[s] ?? s;
}

/** 故人ごとの回忌（表示用） */
export type TargetView = {
  personId: string;
  name: string;
  /** 法号 */
  homyo: string | null;
  relation: string | null;
  deathDate: string | null;
  kaiki: number;
  kaikiName: string;
};
