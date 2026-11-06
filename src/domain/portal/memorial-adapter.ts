// 法要の受付（04）の関数への入口。ポータルからは必ずこのファイルを通して呼ぶ。
// 統合のときに、仮の実装から `@/domain/memorial` の関数の再 export に置き換えた。
// 型（HouseholdMemorialRequest など）は index.ts が再 export しているので、ここに残す（04 の戻り値と同じ形）。
// 04 の決まり: createMemorialRequest はポータルの操作者（personId を持つ）だけが呼べ、監査ログも 04 が書く。
// 家族の can_apply_memorial の判定は、06 が呼ぶ前に行う。

export type MemorialLocation = "temple" | "home" | "grave";
export type MemorialRequestStatus = "requested" | "scheduled" | "declined";

export type CreateMemorialRequestInput = {
  householdId: string;
  /** 1 人以上。複数なら複数霊位供養 */
  targets: { personId: string; kaiki: number }[];
  /** どちらか 1 つ */
  seshuPersonId?: string | null;
  seshuName?: string | null;
  /** "YYYY-MM-DD"。1〜3 件 */
  preferredPeriods: { from: string; to: string; note?: string }[];
  location: MemorialLocation;
  attendees?: number | null;
  otoki?: boolean | null;
  notes?: string | null;
};

export type MemorialTargetView = { personId: string; name: string; kaiki: number; kaikiName: string };

export type MemorialServiceView = {
  id: string;
  startAt: Date;
  location: MemorialLocation;
  officiantName: string;
};

export type HouseholdMemorialRequest = {
  id: string;
  source: "portal" | "phone";
  status: MemorialRequestStatus;
  createdAt: Date;
  requestedByPersonId: string | null;
  requestedByName: string | null;
  targets: MemorialTargetView[];
  preferredPeriods: { from: string; to: string; note?: string }[];
  location: MemorialLocation;
  declineReason: string | null;
  service: MemorialServiceView | null;
};

export type HouseholdMemorialSchedule = {
  confirmed: (MemorialServiceView & { targets: MemorialTargetView[] })[];
  upcoming: {
    personId: string;
    name: string;
    homyo: string | null;
    relation: string | null;
    year: number;
    kaiki: number;
    kaikiName: string;
    meinichi: string;
  }[];
};

export {
  createMemorialRequest,
  getHouseholdMemorialSchedule,
  listMemorialRequestsForHousehold,
  suggestKaiki,
} from "@/domain/memorial";
