// 施設予約の種類、状態、◯×の時間帯（spec.md §6。決めたことは docs/tasks/03-facility.md の「決めること」）

export const RESERVATION_KINDS = ["memorial", "photo", "tea", "other"] as const;
export type ReservationKind = (typeof RESERVATION_KINDS)[number];

export const KIND_LABELS: Record<ReservationKind, string> = {
  memorial: "法要",
  photo: "前撮り撮影",
  tea: "茶会",
  other: "その他",
};

/** 外部の人が申請できる種類（法要は 04 の受付を通す） */
export const PUBLIC_KINDS = ["photo", "tea", "other"] as const satisfies readonly ReservationKind[];
export type PublicKind = (typeof PUBLIC_KINDS)[number];

export const RESERVATION_STATUSES = ["pending", "confirmed", "rejected", "cancelled"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "申請中",
  confirmed: "確定",
  rejected: "お断り",
  cancelled: "取り消し",
};

/** 埋まっているとみなす状態（申請中も仮押さえとして埋まっている） */
export const BUSY_STATUSES = ["pending", "confirmed"] as const satisfies readonly ReservationStatus[];

export function isReservationKind(s: string): s is ReservationKind {
  return (RESERVATION_KINDS as readonly string[]).includes(s);
}

export function kindLabel(kind: string): string {
  return isReservationKind(kind) ? KIND_LABELS[kind] : kind;
}

export function statusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status;
}

/**
 * ◯×の時間帯（日本時間）。午前は 0:00〜12:00、午後は 12:00〜24:00。
 * その時間帯に申請中か確定の予約が少しでもあれば×にする（12:00〜13:00 の予約が隠れないように、1 日を 2 つに分け切る）。
 */
export const AVAILABILITY_SLOTS = [
  { key: "am", label: "午前", start: "00:00", end: "12:00" },
  { key: "pm", label: "午後", start: "12:00", end: "24:00" },
] as const;
export type AvailabilitySlotKey = (typeof AVAILABILITY_SLOTS)[number]["key"];

/**
 * 申請フォームの「午前」「午後」「終日」が表す、実際の利用時間（日本時間）。
 * 時刻を指定することもできる（PUBLIC_TIME_RANGE の中で 30 分刻み）。
 */
export const APPLY_PERIODS = {
  am: { label: "午前（9:00〜12:00）", start: "09:00", end: "12:00" },
  pm: { label: "午後（13:00〜17:00）", start: "13:00", end: "17:00" },
  day: { label: "終日（9:00〜17:00）", start: "09:00", end: "17:00" },
} as const;
export type ApplyPeriod = keyof typeof APPLY_PERIODS;

/** 公開ページで時刻を指定するときの範囲 */
export const PUBLIC_TIME_RANGE = { first: "08:00", last: "20:00", stepMin: 30 } as const;

/** 公開ページの空き状況と申請を受け付ける期間（今日から何日先まで） */
export const PUBLIC_HORIZON_DAYS = 180;
