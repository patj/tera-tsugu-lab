// スタッフのカレンダー（calendar）の MCP ツール（spec.md §3.2、§4）
// 私的な予定の内容の保護はドメイン層（getCalendar / getStaffBusyIntervals）が行う。ここでは表示の形に変えるだけ。
import { z } from "zod";
import { db } from "@/db/client";
import {
  BUSY_LABEL,
  createSharedEvent,
  DEFAULT_DAY_END,
  DEFAULT_DAY_START,
  getCalendar,
  getStaffAvailability,
  getStaffBusyIntervals,
  resolveStaff,
  type CalendarEvent,
} from "@/domain/calendar";
import {
  addDays,
  formatJst,
  invalid,
  jst,
  jstDateString,
  jstParts,
  jstTimeString,
  parseDateString,
  parseJstDateTime,
  type Interval,
} from "@/domain/core";
import { defineReadTool, defineWriteTool, type ToolContext, type ToolDef } from "../framework/define";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDate(date: string): string {
  return `${date}（${WEEKDAYS[jstParts(jst(date)).weekday]}）`;
}

function formatInterval(i: Interval): string {
  const sameDay = jstDateString(i.start) === jstDateString(new Date(i.end.getTime() - 1));
  return sameDay
    ? `${jstTimeString(i.start)}〜${jstTimeString(i.end)}`
    : `${formatJst(i.start)}〜${formatJst(i.end)}`;
}

const dateArg = z.string().describe('日付（日本時間。"YYYY-MM-DD"）');
const staffArg = z
  .array(z.string())
  .optional()
  .describe("スタッフの名前か役職（例: 住職、副住職、執事長、奥様、高橋 日明）。whoami でスタッフの一覧を見られる");

function checkDates(from: string, to: string | undefined): { from: string; to: string } {
  parseDateString(from);
  const end = to ?? from;
  parseDateString(end);
  if (end < from) throw invalid("期間の終わり（to）は、始まり（from）と同じか後の日にしてください");
  return { from, to: end };
}

async function staffIdsOf(ctx: ToolContext, names: string[] | undefined): Promise<string[] | undefined> {
  if (!names || names.length === 0) return undefined;
  return (await resolveStaff(ctx.actor.templeId, names)).map((s) => s.id);
}

// ---- check_staff_availability ----

const checkStaffAvailability = defineReadTool({
  name: "check_staff_availability",
  description:
    "期間（日付）とスタッフを指定して、各日の空いている時間と埋まっている時間を返す。" +
    "スタッフを省略すると、法要の担当者（住職、副住職、執事長など、法要を担当できる人）を対象にする。" +
    "埋まっている時間には、私的な予定も含まれる（内容は返さないので、推測して伝えない）。" +
    `1 日の範囲は、省略すると ${DEFAULT_DAY_START}〜${DEFAULT_DAY_END}。` +
    "法要の候補の日時を出すときは、本堂の空きも見る find_memorial_slots を使う。",
  input: {
    from: dateArg,
    to: dateArg.optional().describe('期間の終わりの日付（この日を含む。"YYYY-MM-DD"）。省略すると from の 1 日だけ'),
    staff: staffArg,
    day_start: z.string().optional().describe(`1 日の範囲の始まり（"HH:MM"）。省略すると ${DEFAULT_DAY_START}`),
    day_end: z.string().optional().describe(`1 日の範囲の終わり（"HH:MM"）。省略すると ${DEFAULT_DAY_END}`),
  },
  handler: async (args, ctx) => {
    const { from, to } = checkDates(args.from, args.to);
    const staffIds = await staffIdsOf(ctx, args.staff);
    const dayStart = args.day_start ?? DEFAULT_DAY_START;
    const dayEnd = args.day_end ?? DEFAULT_DAY_END;
    const result = await getStaffAvailability(ctx.actor, { fromDate: from, toDate: to, staffIds, dayStart, dayEnd });
    return {
      期間: `${formatDate(from)}〜${formatDate(to)}`,
      "1日の範囲": `${dayStart}〜${dayEnd}`,
      注意: "埋まっている時間には私的な予定も含みます。内容は表示しません",
      staff: result.map((r) => ({
        name: r.staff.name,
        role: r.staff.roleTitle,
        法要の担当者: r.staff.isOfficiant,
        days: r.days.map((d) => ({
          date: formatDate(d.date),
          空いている時間: d.free.map(formatInterval),
          埋まっている時間: d.busy.map(formatInterval),
        })),
      })),
    };
  },
});

// ---- get_staff_calendar ----

function eventToOutput(e: CalendarEvent, me: string, names: Map<string, string>) {
  const time = formatInterval(e);
  if (e.kind === "busy") {
    return { date: formatDate(jstDateString(e.start)), 時間: time, スタッフ: [names.get(e.staffId) ?? "?"], 種類: "私的な予定", 内容: BUSY_LABEL };
  }
  return {
    date: formatDate(jstDateString(e.start)),
    時間: time,
    スタッフ: e.assignees.map((a) => `${a.roleTitle} ${a.name}`),
    種類: e.visibility === "shared" ? "業務の予定" : e.ownerStaffId === me ? "私的な予定（あなたの予定）" : "私的な予定",
    カテゴリ: e.category,
    タイトル: e.title,
    ...(e.body ? { 内容: e.body } : {}),
    ...(e.memorialServiceId ? { 法要: true } : {}),
  };
}

const getStaffCalendar = defineReadTool({
  name: "get_staff_calendar",
  description:
    "期間（日付）とスタッフを指定して、スタッフのカレンダーの予定を返す。スタッフを省略すると全員。" +
    "業務の予定は、時間、担当者、内容のすべてを返す。" +
    "他のスタッフの私的な予定は「予定あり」と時間だけを返す（内容は推測して伝えない）。操作者本人の私的な予定は内容まで返す。",
  input: {
    from: dateArg,
    to: dateArg.optional().describe('期間の終わりの日付（この日を含む。"YYYY-MM-DD"）。省略すると from の 1 日だけ。最長 62 日'),
    staff: staffArg,
  },
  handler: async (args, ctx) => {
    const { from, to } = checkDates(args.from, args.to);
    const staffIds = await staffIdsOf(ctx, args.staff);
    const view = await getCalendar(ctx.actor, { from: jst(from), to: jst(addDays(to, 1)), staffIds });
    const names = new Map(view.staff.map((s) => [s.id, `${s.roleTitle} ${s.name}`]));
    return {
      期間: `${formatDate(from)}〜${formatDate(to)}`,
      staff: view.staff.map((s) => ({ name: s.name, role: s.roleTitle, 法要の担当者: s.isOfficiant })),
      件数: view.events.length,
      events: view.events.map((e) => eventToOutput(e, ctx.actor.staffId, names)),
    };
  },
});

// ---- create_staff_event ----

/** MCP から作れるカテゴリ（「法要」は book_memorial_service が法要とひもづけて作る。「私用」は私的な予定だけ） */
const MCP_EVENT_CATEGORIES = ["行事", "外出", "来客", "その他"] as const;

const createStaffEventInput = {
  title: z.string().min(1).max(100).describe("予定のタイトル（例: 檀信徒総会の準備）"),
  category: z.enum(MCP_EVENT_CATEGORIES).describe("カテゴリ（法要の予定は book_memorial_service で作る）"),
  start: z.string().describe('始まり（日本時間。"YYYY-MM-DD HH:MM"）'),
  end: z.string().describe('終わり（日本時間。"YYYY-MM-DD HH:MM"）'),
  assignees: z.array(z.string()).min(1).describe("担当者の名前か役職（1 人以上。ログインしないアルバイトなども指定できる）"),
  body: z.string().max(2000).optional().describe("内容のメモ"),
};

async function prepareEvent(args: z.infer<z.ZodObject<typeof createStaffEventInput>>, ctx: ToolContext) {
  const start = parseJstDateTime(args.start);
  const end = parseJstDateTime(args.end);
  if (start.getTime() >= end.getTime()) throw invalid("終わり（end）は、始まり（start）より後にしてください");
  const assignees = await resolveStaff(ctx.actor.templeId, args.assignees);
  if (assignees.length === 0) throw invalid("担当者を 1 人以上指定してください");
  return { start, end, assignees };
}

const createStaffEvent = defineWriteTool({
  name: "create_staff_event",
  description:
    "業務の予定（行事、外出、来客など）を登録し、担当者を割り当てる。担当者は複数でもよい。" +
    "私的な予定は MCP からは作らない（本人が管理画面で登録する）。" +
    "法要の予定は book_memorial_service が自動で作るので、このツールでは作らない。",
  input: createStaffEventInput,
  preview: async (args, ctx) => {
    const { start, end, assignees } = await prepareEvent(args, ctx);
    const busy = await getStaffBusyIntervals(
      assignees.map((s) => s.id),
      { from: start, to: end },
    );
    const conflicts = assignees.filter((s) => busy[s.id].length > 0).map((s) => `${s.roleTitle} ${s.name}`);
    const lines = [
      "次の業務の予定を登録します。",
      `・タイトル: ${args.title}`,
      `・カテゴリ: ${args.category}`,
      `・日時: ${formatJst(start)}〜${jstDateString(start) === jstDateString(end) ? jstTimeString(end) : formatJst(end)}`,
      `・担当者: ${assignees.map((s) => `${s.roleTitle} ${s.name}`).join("、")}`,
      ...(args.body ? [`・内容: ${args.body}`] : []),
      ...(conflicts.length > 0
        ? [`※ ${conflicts.join("、")} は、この時間に別の予定があります（重なっても登録はできます）`]
        : []),
    ];
    return {
      summary: lines.join("\n"),
      details: {
        title: args.title,
        category: args.category,
        start: formatJst(start),
        end: formatJst(end),
        assignees: assignees.map((s) => ({ name: s.name, role: s.roleTitle })),
        重なる予定がある担当者: conflicts,
      },
    };
  },
  execute: async (args, ctx) => {
    const { start, end, assignees } = await prepareEvent(args, ctx);
    const id = await db.transaction((tx) =>
      createSharedEvent(ctx.actor, tx, {
        category: args.category,
        title: args.title,
        body: args.body ?? null,
        start,
        end,
        assigneeStaffIds: assignees.map((s) => s.id),
      }),
    );
    return {
      id,
      message: `業務の予定「${args.title}」（${formatJst(start)}〜）を登録しました。管理画面のカレンダーに表示されます`,
    };
  },
});

export const calendarTools: ToolDef[] = [checkStaffAvailability, getStaffCalendar, createStaffEvent];
