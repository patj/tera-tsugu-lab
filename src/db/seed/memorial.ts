// 法要の受付（memorial）のシード。ledger、calendar、facility のあとに流す。
// - 確定した法要（2026 年 11 月〜2027 年 3 月）を bookMemorialService で作る（担当者の予定と本堂の予約も一緒にできる）。
//   本堂の予約（03）と担当者の予定（02）を避けた日時にしてある。重なれば bookMemorialService が conflict を投げ、db:reset が止まる
// - ポータルから受けた申し込み（受付済み）を 2 件
// - 山田家（場面 0）と田中家（場面 5）には、法要も申し込みも入れない
// - 2027-03-15 の 10 時台は、住職と本堂を空けたままにする（場面 0 で「3/15 の 10 時、住職の担当で」と確定する）
// - 場面 4 のために、12/6 の午前と 12/13 の午後は、どの施設も使わない
// 名前（ctx.get）: "memorial_service:<世帯>"、"memorial_request:<世帯>"
import { jst, type Actor } from "@/domain/core";
import {
  bookMemorialService,
  createMemorialRequest,
  type CreateMemorialRequestInput,
  type MemorialLocation,
} from "@/domain/memorial";
import type { Seed, SeedContext } from "./context";

type StaffKey = "jushoku" | "fukujushoku" | "shitsujicho";

type SeedService = {
  household: string;
  /** [役, 回忌] */
  targets: [string, number][];
  date: string;
  time: string;
  officiant: StaffKey;
  location: MemorialLocation;
  travel?: [number, number];
  notes?: string;
  attendees?: number;
  otoki?: boolean;
};

/** 電話で受けて確定した法要（申し込みは source = phone で自動で作られる） */
const PHONE_SERVICES: SeedService[] = [
  { household: "nakamura", targets: [["father", 7]], date: "2026-11-22", time: "10:00", officiant: "jushoku", location: "temple", attendees: 10, otoki: true },
  { household: "suzuki", targets: [["mother", 2]], date: "2026-11-29", time: "11:00", officiant: "fukujushoku", location: "temple", attendees: 15, otoki: true },
  {
    household: "watanabe",
    targets: [["mother", 33]],
    date: "2026-12-05",
    time: "10:00",
    officiant: "shitsujicho",
    location: "grave",
    travel: [15, 15],
    notes: "三十三回忌で弔い上げ。墓前で読経",
  },
  {
    household: "sato",
    targets: [["father", 7], ["mother", 3]],
    date: "2026-12-12",
    time: "13:00",
    officiant: "jushoku",
    location: "temple",
    attendees: 12,
    otoki: false,
  },
  {
    household: "ito",
    targets: [["father", 13]],
    date: "2026-12-19",
    time: "10:00",
    officiant: "fukujushoku",
    location: "home",
    travel: [30, 30],
    notes: "駐車場あり",
  },
];

/** ポータルから受けて、確定まで済んだ申し込み */
const PORTAL_SCHEDULED: { request: Omit<CreateMemorialRequestInput, "householdId" | "targets">; by: string; service: SeedService } = {
  by: "head",
  request: {
    preferredPeriods: [
      { from: "2027-03-06", to: "2027-03-07", note: "土日を希望" },
      { from: "2027-02-27", to: "2027-02-28" },
    ],
    location: "temple",
    attendees: 14,
    otoki: true,
    notes: "父の三回忌と母の七回忌をあわせてお願いしたいです",
  },
  service: {
    household: "abe",
    targets: [["father", 3], ["mother", 7]],
    date: "2027-03-06",
    time: "11:00",
    officiant: "fukujushoku",
    location: "temple",
  },
};

/** ポータルから受けて、まだ日時が決まっていない申し込み（受付済み） */
const PORTAL_REQUESTED: { household: string; by: string; targets: [string, number][]; request: Omit<CreateMemorialRequestInput, "householdId" | "targets"> }[] = [
  {
    household: "kobayashi",
    by: "head",
    targets: [["mother", 13]],
    request: {
      preferredPeriods: [
        { from: "2027-01-02", to: "2027-01-03", note: "命日の前に" },
        { from: "2027-01-09", to: "2027-01-10", note: "正月で難しければ" },
      ],
      location: "temple",
      attendees: 8,
      otoki: false,
      notes: "親戚が遠方から来るので、午後だと助かります",
    },
  },
  {
    household: "inoue",
    by: "head",
    targets: [["mother", 17]],
    request: {
      preferredPeriods: [{ from: "2027-08-28", to: "2027-09-05" }],
      location: "home",
      attendees: 6,
      otoki: false,
    },
  },
];

function portalActorOf(ctx: SeedContext, household: string, role: string): Actor {
  return {
    templeId: ctx.templeId,
    channel: "portal",
    personId: ctx.get(`person:${household}:${role}`),
    label: `seed:portal:${household}:${role}`,
  };
}

function targetsOf(ctx: SeedContext, household: string, targets: [string, number][]) {
  return targets.map(([role, kaiki]) => ({ personId: ctx.get(`person:${household}:${role}`), kaiki }));
}

async function book(ctx: SeedContext, staffActor: Actor, s: SeedService, memorialRequestId?: string) {
  const r = await bookMemorialService(
    staffActor,
    {
      memorialRequestId: memorialRequestId ?? null,
      householdId: ctx.get(`household:${s.household}`),
      targets: targetsOf(ctx, s.household, s.targets),
      location: s.location,
      start: jst(s.date, s.time),
      officiantStaffId: ctx.get(`staff:${s.officiant}`),
      travelBeforeMin: s.travel?.[0] ?? null,
      travelAfterMin: s.travel?.[1] ?? null,
      notes: s.notes ?? null,
      attendees: s.attendees ?? null,
      otoki: s.otoki ?? null,
    },
    ctx.db,
    // シードは撮影の前（2026-11-01）に入れたことにする（過ぎた日時の確定を止める判定のため）
    { now: new Date("2026-11-01T00:00:00+09:00") },
  );
  ctx.set(`memorial_service:${s.household}`, r.serviceId);
  ctx.set(`memorial_request:${s.household}`, r.requestId);
}

export const memorialSeed: Seed = {
  name: "memorial",
  async run(ctx) {
    // 03 の確定の予約を作るために、staffId を持つ操作者にする（電話を受けたのは住職）
    const staffActor: Actor = { ...ctx.actor, staffId: ctx.get("staff:jushoku") };
    const today = "2026-11-01";

    for (const s of PHONE_SERVICES) await book(ctx, staffActor, s);

    const p = PORTAL_SCHEDULED;
    const { id } = await createMemorialRequest(
      portalActorOf(ctx, p.service.household, p.by),
      { ...p.request, householdId: ctx.get(`household:${p.service.household}`), targets: targetsOf(ctx, p.service.household, p.service.targets) },
      { today },
      ctx.db,
    );
    await book(ctx, staffActor, p.service, id);

    for (const r of PORTAL_REQUESTED) {
      const created = await createMemorialRequest(
        portalActorOf(ctx, r.household, r.by),
        { ...r.request, householdId: ctx.get(`household:${r.household}`), targets: targetsOf(ctx, r.household, r.targets) },
        { today },
        ctx.db,
      );
      ctx.set(`memorial_request:${r.household}`, created.id);
    }
  },
};
