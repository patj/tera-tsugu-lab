// 施設予約（facility）のシード: 施設と、2026 年 11 月〜2027 年 3 月の予約（前撮り、茶会など。確定と申請中）。
// スタッフと施設だけに依存する（世帯や一般コンタクトにはひもづけない。申請者の名前は title に入れる）。
// 名前: "facility:hondo"（本堂）/ "facility:higashi"（東席）/ "facility:naka"（中席）/ "facility:nishi"（西席）/ "facility:teien"（庭園）
//
// 台本のために空けておく時間（docs/tasks/03-facility.md の「シード」も参照）:
// - 場面 4: 2026-12-06（日）午前の本堂、2026-12-13（日）午後の東席。同じ日のほかの施設のその時間帯も空けておく
// - 場面 0: 2027-03-15（月）の本堂の午前（10:00 の法要を入れる）
import { facilities } from "../schema";
import { jst } from "@/domain/core";
import { createReservation, rejectReservation, type ReservationKind } from "@/domain/facility";
import type { Seed } from "./context";

export const SEED_FACILITIES = [
  { key: "hondo", name: "本堂" },
  { key: "higashi", name: "東席" },
  { key: "naka", name: "中席" },
  { key: "nishi", name: "西席" },
  { key: "teien", name: "庭園" },
] as const;

type FacilityKey = (typeof SEED_FACILITIES)[number]["key"];

type SeedReservation = {
  facility: FacilityKey;
  date: string;
  start: string;
  end: string;
  kind: Exclude<ReservationKind, "memorial">;
  status: "pending" | "confirmed" | "rejected";
  title: string;
  notes?: string;
  rejectReason?: string;
};

export const SEED_RESERVATIONS: SeedReservation[] = [
  // 2026 年 11 月
  { facility: "teien", date: "2026-11-14", start: "10:00", end: "12:00", kind: "photo", status: "confirmed", title: "佐々木様 前撮り", notes: "和装。紅葉を背景に" },
  { facility: "hondo", date: "2026-11-15", start: "10:00", end: "12:00", kind: "photo", status: "rejected", title: "大野様 前撮り", rejectReason: "その日は本堂で行事があるため、お受けできません。別の日でご相談ください" },
  { facility: "teien", date: "2026-11-21", start: "13:00", end: "15:00", kind: "photo", status: "pending", title: "前川様 前撮り", notes: "カメラマン 2 名、親族 4 名" },
  { facility: "higashi", date: "2026-11-22", start: "13:00", end: "16:00", kind: "tea", status: "confirmed", title: "青葉会 月釜" },
  { facility: "hondo", date: "2026-11-28", start: "13:00", end: "15:00", kind: "photo", status: "confirmed", title: "山本様・村井様 前撮り" },
  // 2026 年 12 月（12/6 午前の本堂と 12/13 午後の東席は空けておく）
  { facility: "naka", date: "2026-12-05", start: "13:00", end: "16:00", kind: "tea", status: "confirmed", title: "青葉会 口切の茶事" },
  { facility: "hondo", date: "2026-12-06", start: "14:00", end: "16:00", kind: "photo", status: "confirmed", title: "石川様 前撮り" },
  { facility: "higashi", date: "2026-12-13", start: "09:30", end: "12:00", kind: "tea", status: "confirmed", title: "朝茶の会" },
  { facility: "nishi", date: "2026-12-19", start: "10:00", end: "15:00", kind: "other", status: "confirmed", title: "書道教室 作品展" },
  { facility: "naka", date: "2026-12-20", start: "13:00", end: "16:00", kind: "tea", status: "pending", title: "松風会 茶会", notes: "15 名ほど" },
  // 2027 年 1 月
  { facility: "higashi", date: "2027-01-10", start: "10:00", end: "16:00", kind: "tea", status: "confirmed", title: "青葉会 初釜" },
  { facility: "naka", date: "2027-01-10", start: "10:00", end: "16:00", kind: "tea", status: "confirmed", title: "青葉会 初釜（待合）" },
  { facility: "hondo", date: "2027-01-16", start: "13:00", end: "15:00", kind: "photo", status: "pending", title: "藤田様 前撮り" },
  { facility: "hondo", date: "2027-01-23", start: "10:00", end: "12:00", kind: "photo", status: "confirmed", title: "中島様 前撮り" },
  // 2027 年 2 月
  { facility: "teien", date: "2027-02-11", start: "13:00", end: "15:00", kind: "photo", status: "confirmed", title: "岡田様 前撮り", notes: "雪の場合は本堂に変更の相談あり" },
  { facility: "naka", date: "2027-02-20", start: "13:00", end: "16:00", kind: "tea", status: "confirmed", title: "松風会 梅見の茶会" },
  { facility: "nishi", date: "2027-02-27", start: "10:00", end: "12:00", kind: "other", status: "pending", title: "句会 吟行", notes: "庭園の散策を含む" },
  // 2027 年 3 月（3/15 の本堂の午前は空けておく。前後に前撮りを入れて、法要の候補から外れることを見せる）
  { facility: "hondo", date: "2027-03-14", start: "10:00", end: "12:00", kind: "photo", status: "confirmed", title: "森様 前撮り" },
  { facility: "hondo", date: "2027-03-15", start: "14:00", end: "16:00", kind: "photo", status: "confirmed", title: "小川様 前撮り" },
  { facility: "hondo", date: "2027-03-16", start: "13:00", end: "15:00", kind: "photo", status: "pending", title: "井上様 前撮り" },
  { facility: "teien", date: "2027-03-20", start: "10:00", end: "12:00", kind: "photo", status: "confirmed", title: "長谷川様 前撮り" },
  { facility: "higashi", date: "2027-03-27", start: "13:00", end: "16:00", kind: "tea", status: "pending", title: "青葉会 花見の茶会" },
];

export const facilitySeed: Seed = {
  name: "facility",
  async run(ctx) {
    const ids = {} as Record<FacilityKey, string>;
    for (const [i, f] of SEED_FACILITIES.entries()) {
      const [row] = await ctx.db
        .insert(facilities)
        .values({ templeId: ctx.templeId, name: f.name, position: i })
        .returning({ id: facilities.id });
      ids[f.key] = row.id;
      ctx.set(`facility:${f.key}`, row.id);
    }

    // 予約はドメイン層を通して作る（重なりのチェックと申請番号の発行も通す）。操作者は住職
    const actor = { ...ctx.actor, staffId: ctx.get("staff:jushoku"), label: "system:seed" };
    for (const r of SEED_RESERVATIONS) {
      const created = await createReservation(actor, ctx.db, {
        facilityId: ids[r.facility],
        kind: r.kind,
        status: r.status === "confirmed" ? "confirmed" : "pending",
        start: jst(r.date, r.start),
        end: jst(r.date, r.end),
        title: r.title,
        notes: r.notes,
      });
      if (r.status === "rejected") await rejectReservation(actor, ctx.db, created.id, r.rejectReason ?? "");
    }
  },
};
