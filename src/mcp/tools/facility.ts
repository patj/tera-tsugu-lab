// 施設予約（facility）の MCP ツール（spec.md §4、§6）。取り消しは MCP では行わない（管理画面からだけ）
import { z } from "zod";
import { db } from "@/db/client";
import {
  addDays,
  conflict,
  eachDate,
  invalid,
  jst,
  jstDateString,
  parseDateString,
  parseJstDateTime,
  todayJst,
  type Actor,
} from "@/domain/core";
import {
  KIND_LABELS,
  STATUS_LABELS,
  approveReservation,
  registerReservation,
  findConcurrentReservations,
  findConflicts,
  findFacility,
  findReservation,
  formatRange,
  getAvailability,
  kindLabel,
  listReservations,
  rejectReservation,
  slotInterval,
  statusLabel,
  withParty,
  type Reservation,
  type ReservationStatus,
  type ReservationWithParty,
} from "@/domain/facility";
import { defineReadTool, defineWriteTool, type ToolDef } from "../framework/define";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const MAX_DAYS = 62;

function dateLabel(date: string): string {
  return `${date}（${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}）`;
}

function checkDate(s: string, label: string): string {
  try {
    parseDateString(s);
  } catch {
    throw invalid(`${label}は YYYY-MM-DD の形で指定してください: ${s}`);
  }
  return s;
}

/** 予約を、住職に見せる形にする */
function present(r: ReservationWithParty) {
  return {
    申請番号: r.requestCode,
    施設: r.facilityName,
    種類: kindLabel(r.kind),
    状態: statusLabel(r.status),
    日時: formatRange(r.start, r.end),
    申請者: r.partyName ?? undefined,
    電話: r.contactPhone ?? undefined,
    メール: r.contactEmail ?? undefined,
    件名: r.title ?? undefined,
    内容: r.notes ?? undefined,
    お断りの理由: r.rejectReason ?? undefined,
  };
}

function brief(r: Reservation) {
  return `${r.facilityName} ${formatRange(r.start, r.end)} ${kindLabel(r.kind)}（${statusLabel(r.status)}）${r.title ? ` ${r.title}` : ""}`;
}

/** 承認待ちの予約が、法要やほかの予約と重ならないかの確認結果 */
async function overlapReport(templeId: string, r: Reservation) {
  const c = await findConcurrentReservations(templeId, r);
  const memorials = c.otherFacilities.filter((x) => x.kind === "memorial");
  return {
    同じ施設: c.sameFacility.length === 0 ? "同じ施設の法要・予約とは重なりません" : c.sameFacility.map(brief),
    法要: memorials.length === 0 ? "同じ時間の法要はありません" : memorials.map(brief),
    同じ時間のほかの施設の予約: c.otherFacilities.filter((x) => x.kind !== "memorial").map(brief),
  };
}

const checkFacilityAvailability = defineReadTool({
  name: "check_facility_availability",
  description:
    "施設（本堂、東席、中席、西席、庭園）の空き状況を、日ごとの午前・午後の◯×と、入っている予約の一覧で返す。" +
    "×は申請中（仮押さえ）か確定の予約があること。午前は 0:00〜12:00、午後は 12:00〜24:00（日本時間）。" +
    `期間を省くと今日から 14 日間。一度に ${MAX_DAYS} 日まで。`,
  input: {
    from: z.string().optional().describe("期間の始まりの日（YYYY-MM-DD）。省くと今日"),
    to: z.string().optional().describe("期間の終わりの日（YYYY-MM-DD、この日を含む）。省くと始まりから 14 日間"),
    facility: z.string().optional().describe("施設の名前（例: 本堂）。省くとすべての施設"),
  },
  handler: async ({ from, to, facility }, { actor, now }) => {
    const f = checkDate(from ?? todayJst(now), "期間の始まり");
    const t = checkDate(to ?? addDays(f, 13), "期間の終わり");
    if (eachDate(f, t).length > MAX_DAYS) throw invalid(`期間は ${MAX_DAYS} 日までにしてください`);
    const only = facility ? await findFacility(actor.templeId, facility) : undefined;
    const a = await getAvailability({ from: f, to: t, templeId: actor.templeId, facilityIds: only && [only.id] });
    const list = await listReservations(actor.templeId, {
      statuses: ["pending", "confirmed"],
      facilityId: only?.id,
      from: jst(f),
      to: jst(addDays(t, 1)),
    });
    return {
      期間: `${dateLabel(f)}〜${dateLabel(t)}`,
      凡例: "◯ は空き、× は申請中か確定の予約あり。午前は 0:00〜12:00、午後は 12:00〜24:00",
      施設: a.facilities.map((fac) => ({
        施設: fac.name,
        日ごと: fac.days.map((d) => {
          const day = list.filter(
            (r) => r.facilityId === fac.id && r.start < slotInterval(d.date, "pm").end && r.end > slotInterval(d.date, "am").start,
          );
          return {
            日付: dateLabel(d.date),
            午前: d.available.am ? "◯" : "×",
            午後: d.available.pm ? "◯" : "×",
            ...(day.length > 0
              ? { 予約: day.map((r) => `${formatRange(r.start, r.end)} ${kindLabel(r.kind)}（${statusLabel(r.status)}）${r.title ? ` ${r.title}` : ""}`) }
              : {}),
          };
        }),
      })),
    };
  },
});

const STATUS_FILTER = ["pending", "confirmed", "rejected", "cancelled", "all"] as const;

const listReservationsTool = defineReadTool({
  name: "list_reservations",
  description:
    "施設の予約の一覧を返す。承認待ち（申請中）が先頭。「承認待ちの予約はある？」には status = pending で呼ぶ。" +
    "承認待ちの予約には、同じ時間に入っている法要やほかの施設の予約（重なりの確認）もあわせて返すので、承認の前に「法要と重ならないこと」を住職に伝える。" +
    "期間を省くと今日以降。予約を承認するときは approve_reservation、断るときは reject_reservation に申請番号を渡す。",
  input: {
    status: z
      .enum(STATUS_FILTER)
      .optional()
      .describe("pending（承認待ち）/ confirmed（確定）/ rejected（お断り）/ cancelled（取り消し）/ all。省くと申請中と確定"),
    from: z.string().optional().describe("期間の始まりの日（YYYY-MM-DD）。省くと今日"),
    to: z.string().optional().describe("期間の終わりの日（YYYY-MM-DD、この日を含む）。省くと終わりなし"),
    facility: z.string().optional().describe("施設の名前（例: 本堂）"),
  },
  handler: async ({ status, from, to, facility }, { actor, now }) => {
    const f = checkDate(from ?? todayJst(now), "期間の始まり");
    const t = to ? checkDate(to, "期間の終わり") : undefined;
    const only = facility ? await findFacility(actor.templeId, facility) : undefined;
    const statuses: ReservationStatus[] =
      status === "all" ? [] : status ? [status] : ["pending", "confirmed"];
    const list = await listReservations(actor.templeId, {
      statuses,
      facilityId: only?.id,
      from: jst(f),
      to: t ? jst(addDays(t, 1)) : undefined,
      limit: 100,
    });
    const items = [];
    for (const r of list) {
      items.push(r.status === "pending" ? { ...present(r), 重なりの確認: await overlapReport(actor.templeId, r) } : present(r));
    }
    return {
      件数: items.length,
      承認待ちの件数: list.filter((r) => r.status === "pending").length,
      予約: items,
    };
  },
});

const createReservationInput = {
  facility: z.string().describe("施設の名前（本堂、東席、中席、西席、庭園）"),
  kind: z
    .enum(["photo", "tea", "other"])
    .describe("photo（前撮り撮影）/ tea（茶会）/ other（その他）。法要は book_memorial_service で登録する"),
  start: z.string().describe("始まりの日時（日本時間。例: 2026-12-06 10:00）。準備の時間を含める"),
  end: z.string().describe("終わりの日時（例: 2026-12-06 12:00）または時刻だけ（例: 12:00）。片付けの時間を含める"),
  status: z.enum(["pending", "confirmed"]).optional().describe("pending（申請中）/ confirmed（確定）。省くと確定"),
  title: z.string().max(100).optional().describe("件名（例: 佐藤様 前撮り）"),
  notes: z.string().max(2000).optional().describe("内容やメモ"),
  contact_name: z.string().max(100).optional().describe("申込者の氏名（一般の方。一般コンタクトとして登録する）"),
  contact_phone: z.string().max(30).optional().describe("申込者の電話番号"),
  contact_email: z.string().max(200).optional().describe("申込者のメールアドレス"),
};

async function resolveCreate(
  actor: Actor,
  args: { facility: string; start: string; end: string; status?: "pending" | "confirmed" },
) {
  const facility = await findFacility(actor.templeId, args.facility);
  const start = parseJstDateTime(args.start);
  const end = /^\d{1,2}:\d{2}$/.test(args.end.trim())
    ? parseJstDateTime(`${jstDateString(start)} ${args.end.trim()}`)
    : parseJstDateTime(args.end);
  if (start >= end) throw invalid("終わりの日時は、始まりより後にしてください");
  return { facility, start, end, status: args.status ?? "confirmed" };
}

const createReservationTool = defineWriteTool({
  name: "create_reservation",
  description:
    "施設の予約を登録する（電話で受けた前撮りや茶会など）。状態は確定（confirmed）か申請中（pending）。" +
    "同じ施設の申請中・確定の予約と重なる場合は登録できない（申請中の予約と同じ時間にしたいときは、先に reject_reservation で断る）。" +
    "法要は book_memorial_service で登録する。",
  input: createReservationInput,
  preview: async (args, { actor }) => {
    const { facility, start, end, status } = await resolveCreate(actor, args);
    const found = await findConflicts(facility.id, { start, end });
    if (found.length > 0) throw conflict(`${facility.name}は、その時間に別の予約と重なります: ${found.map(brief).join("、")}`);
    const lines = [
      `次の施設の予約を登録します（${STATUS_LABELS[status]}）。`,
      `- 施設: ${facility.name}`,
      `- 日時: ${formatRange(start, end)}`,
      `- 種類: ${KIND_LABELS[args.kind]}`,
      args.title && `- 件名: ${args.title}`,
      args.contact_name &&
        `- 申込者: ${args.contact_name}${args.contact_phone ? `（${args.contact_phone}）` : ""}（一般コンタクトとして登録）`,
      args.notes && `- 内容: ${args.notes}`,
    ].filter(Boolean);
    return { summary: lines.join("\n") };
  },
  execute: async (args, { actor }) => {
    const { facility, start, end, status } = await resolveCreate(actor, args);
    const r = await registerReservation(actor, {
      facilityId: facility.id,
      kind: args.kind,
      status,
      start,
      end,
      title: args.title,
      notes: args.notes,
      contact: { name: args.contact_name, phone: args.contact_phone, email: args.contact_email },
    });
    const [w] = await withParty([r]);
    return present(w);
  },
});

const codeInput = z.string().min(1).describe("申請番号（例: ABCD-2345。list_reservations で確かめる）");

async function pendingReservation(actor: Actor, code: string): Promise<Reservation> {
  const r = await findReservation(actor.templeId, code);
  if (r.status !== "pending") {
    throw invalid(`申請番号 ${r.requestCode} の予約は${statusLabel(r.status)}です。承認・お断りできるのは申請中の予約だけです`);
  }
  return r;
}

const approveReservationTool = defineWriteTool({
  name: "approve_reservation",
  description:
    "申請中の施設の予約を承認して、確定にする。承認の前に list_reservations の「重なりの確認」で、法要やほかの予約と重ならないことを住職に伝える。",
  input: { request_code: codeInput },
  preview: async ({ request_code }, { actor }) => {
    const r = await pendingReservation(actor, request_code);
    const found = await findConflicts(r.facilityId, r, r.id);
    if (found.length > 0) throw conflict(`${r.facilityName}は、その時間に別の予約と重なります: ${found.map(brief).join("、")}`);
    const [w] = await withParty([r]);
    const check = await overlapReport(actor.templeId, r);
    const lines = [
      "次の申請を承認して、確定にします。",
      `- 申請番号: ${r.requestCode}`,
      `- 施設: ${r.facilityName}`,
      `- 日時: ${formatRange(r.start, r.end)}`,
      `- 種類: ${kindLabel(r.kind)}`,
      w.partyName && `- 申請者: ${w.partyName}${w.contactPhone ? `（${w.contactPhone}）` : ""}`,
      r.notes && `- 内容: ${r.notes}`,
      `- 重なりの確認: ${check.同じ施設}。${typeof check.法要 === "string" ? check.法要 : `同じ時間の法要: ${check.法要.join("、")}`}`,
    ].filter(Boolean);
    return { summary: lines.join("\n"), details: { 予約: present(w), 重なりの確認: check } };
  },
  execute: async ({ request_code }, { actor }) => {
    const r = await findReservation(actor.templeId, request_code);
    const done = await db.transaction((tx) => approveReservation(actor, tx, r.id));
    const [w] = await withParty([done]);
    return present(w);
  },
});

const rejectReservationTool = defineWriteTool({
  name: "reject_reservation",
  description:
    "申請中の施設の予約を、理由を添えて断る。理由は申請者が申請番号の画面で見るので、申請者に向けた丁寧な文にする。" +
    "申請中の予約と同じ時間に法要を入れたいときも、先にこれで断る。",
  input: {
    request_code: codeInput,
    reason: z.string().trim().min(1).max(500).describe("お断りの理由（申請者に表示される）"),
  },
  preview: async ({ request_code, reason }, { actor }) => {
    const r = await pendingReservation(actor, request_code);
    const [w] = await withParty([r]);
    const lines = [
      "次の申請をお断りします。理由は、申請者が申請番号の画面で見られます。",
      `- 申請番号: ${r.requestCode}`,
      `- 施設: ${r.facilityName}`,
      `- 日時: ${formatRange(r.start, r.end)}`,
      `- 種類: ${kindLabel(r.kind)}`,
      w.partyName && `- 申請者: ${w.partyName}`,
      `- 理由: ${reason}`,
    ].filter(Boolean);
    return { summary: lines.join("\n") };
  },
  execute: async ({ request_code, reason }, { actor }) => {
    const r = await findReservation(actor.templeId, request_code);
    const done = await db.transaction((tx) => rejectReservation(actor, tx, r.id, reason));
    const [w] = await withParty([done]);
    return present(w);
  },
});

export const facilityTools: ToolDef[] = [
  checkFacilityAvailability,
  listReservationsTool,
  createReservationTool,
  approveReservationTool,
  rejectReservationTool,
];
