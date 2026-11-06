// 法要の受付（memorial）の MCP ツール（spec.md §3、§3.1、§4）:
//   verify_memorial、find_memorial_slots、list_memorial_requests、book_memorial_service、decline_memorial_request
// 台本の場面 0 の流れ: 故人の特定 → 検証（verify_memorial）→ 候補（find_memorial_slots）→ 確定（book_memorial_service → confirm_action）
// 業務のロジックはドメイン層（@/domain/memorial）にある。ここでは引数を受け取り、表示の形に変えるだけ。
import { z } from "zod";
import { resolveStaff } from "@/domain/calendar";
import { formatJst, invalid, jst, jstDateString, jstParts, jstTimeString, parseDateString, type Interval } from "@/domain/core";
import {
  bookMemorialService,
  declineMemorialRequest,
  findMemorialSlots,
  getMemorialRequest,
  JOINT_SERVICE_LABEL,
  LOCATION_LABELS,
  listMemorialRequests,
  planMemorialBooking,
  REQUEST_SOURCE_LABELS,
  REQUEST_STATUS_LABELS,
  verifyMemorial,
  type MemorialBookingPlan,
  type MemorialLocation,
  type MemorialRequestView,
  type TargetView,
  type VerifyCandidate,
} from "@/domain/memorial";
import { defineReadTool, defineWriteTool, type ToolContext, type ToolDef } from "../framework/define";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const dateLabel = (date: string) => `${date}（${WEEKDAYS[jstParts(jst(date)).weekday]}）`;
const rangeLabel = (i: Interval) => `${formatJst(i.start)}〜${jstTimeString(i.end)}`;
const appBaseUrl = () => (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** "YYYY-MM-DD" を検証する（エラーのメッセージは「日付」で始まるので、そのまま利用者に返る） */
const dateArg = (desc: string) =>
  z
    .string()
    .describe(desc)
    .refine(
      (s) => {
        try {
          parseDateString(s);
          return true;
        } catch {
          return false;
        }
      },
      { message: "日付は YYYY-MM-DD の形で、正しい日付を指定してください" },
    );

const timeArg = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/, "時刻は HH:MM の形で指定してください")
  .describe('開始時刻（日本時間。"HH:MM"。例: "10:00"）');

const locationArg = z
  .enum(["temple", "home", "grave"])
  .describe("場所: temple（お寺。本堂を押さえる）/ home（自宅）/ grave（墓前）");

const travelArgs = {
  travel_before_min: z
    .number()
    .int()
    .min(0)
    .max(300)
    .optional()
    .describe("自宅・墓前のときは必須: 行きの移動時間（分）。決まった初期値はないので、わからなければ住職に尋ねる（推測しない）"),
  travel_after_min: z
    .number()
    .int()
    .min(0)
    .max(300)
    .optional()
    .describe("自宅・墓前のときは必須: 帰りの移動時間（分）。わからなければ住職に尋ねる（推測しない）"),
};

const kaikiArg = z
  .number()
  .int()
  .min(1)
  .max(100)
  .describe("回忌の数字。一周忌は 2、三回忌は 3、七回忌は 7、十三回忌は 13（亡くなった年を 1 回忌と数える）");

function targetOut(t: TargetView) {
  return { person_id: t.personId, 俗名: t.name, 法号: t.homyo, 続柄: t.relation, 没年月日: t.deathDate, 回忌: t.kaiki, 呼び名: t.kaikiName };
}

async function officiantIds(ctx: ToolContext, names: string[] | undefined): Promise<string[] | undefined> {
  if (!names || names.length === 0) return undefined;
  return (await resolveStaff(ctx.actor.templeId, names)).map((s) => s.id);
}

// ---- verify_memorial ----

function candidateOut(c: VerifyCandidate) {
  return {
    person_id: c.personId,
    法号: c.homyo,
    俗名: c.name,
    続柄: c.relation,
    没年月日: c.deathDate,
    没年: c.deathYear,
    世帯: { household_id: c.household.id, 名前: c.household.name, 住所: c.household.address, 状態: c.household.statusLabel },
    希望の年の回忌: c.kaikiNameInYear ? `${c.year} 年は${c.kaikiNameInYear}${c.isMemorialYear ? "" : "（年忌ではない）"}` : null,
    依頼の回忌と合う: c.matchesRequestedKaiki,
  };
}

const verifyMemorialTool = defineReadTool({
  name: "verify_memorial",
  description:
    "年忌法要の依頼（例: 「山田さんから、お父さんの七回忌を 3 月にやりたいと連絡があった」）を受けたら、最初に呼ぶ。次の 4 つを確かめる。\n" +
    "1. 故人の特定: person_id がわからなければ、name（名字など）と relation（「お父さん」→「父」）で呼ぶ。" +
    "候補が複数なら status が「要確認」になり、法号・没年・世帯（住所）・その年の回忌が並ぶ。自分で 1 人に決めず、住職に「どちらの方か」を確かめてから、person_id を指定して呼び直す。\n" +
    "2. 回忌と年: 希望の年が何回忌かを計算し、依頼の回忌と食い違えば指摘する。\n" +
    "3. 祥月命日: 希望日がその年の祥月命日より後なら注意を出す（法要は命日より前に繰り上げるのが一般的。受け付けはできる）。\n" +
    "4. 複数霊位供養: 同じ世帯に、同じ年に年忌を迎える故人がほかにいれば、あわせて営む（複数霊位供養）ことを提案できるように返す。住職に提案し、あわせるかどうかを尋ねる。\n" +
    "「3 月に」のように年が言われていなければ、whoami で今日の日付を確かめ、今日より後でいちばん近いその月（今日が 2026 年 11 月なら 2027-03-01〜2027-03-31）を preferred_from / preferred_to にする。" +
    "結果を住職に伝えたら、次は find_memorial_slots で候補の日時を出す。",
  input: {
    person_id: z.string().optional().describe("故人の person_id（search_deceased や、前の verify_memorial の候補で得たもの）。わかっていれば指定する"),
    name: z.string().optional().describe("故人の俗名の一部（名字だけでもよい）。例: 「山田」"),
    relation: z.string().optional().describe("世帯主から見た続柄。例: 「お父さん」なら「父」、「おばあさん」なら「祖母」"),
    homyo: z.string().optional().describe("法号の一部"),
    household_id: z.string().optional().describe("世帯がわかっていれば household_id"),
    kaiki: kaikiArg.optional().describe("依頼された回忌（一周忌は 2、三回忌は 3、七回忌は 7）"),
    preferred_from: dateArg("希望の時期の始まり（YYYY-MM-DD）。「3 月に」なら、いちばん近い 3 月の 1 日").optional(),
    preferred_to: dateArg("希望の時期の終わり（YYYY-MM-DD。この日を含む）。「3 月に」なら 3 月 31 日").optional(),
    date: dateArg("希望日が 1 日に決まっているとき（YYYY-MM-DD）").optional(),
    year: z.number().int().optional().describe("年だけ言われたとき（例: 2027）"),
  },
  handler: async (args, { actor, now }) => {
    const period =
      args.preferred_from || args.preferred_to
        ? { from: args.preferred_from ?? args.preferred_to!, to: args.preferred_to ?? args.preferred_from! }
        : null;
    const r = await verifyMemorial(actor, {
      personId: args.person_id,
      name: args.name,
      relation: args.relation,
      homyo: args.homyo,
      householdId: args.household_id,
      kaiki: args.kaiki,
      year: args.year,
      date: args.date,
      period,
      today: jstDateString(now),
    });
    if (r.status === "not_found") return { status: "見つからない", メッセージ: r.message };
    if (r.status === "needs_identification") {
      return {
        status: "要確認",
        メッセージ: r.message,
        候補: r.candidates.map(candidateOut),
        次にすること: "候補を法号・没年・世帯（住所）で住職に伝え、どの方かを確かめてから、person_id を指定して verify_memorial を呼び直す",
      };
    }
    const c = r.checks;
    return {
      status: "確認済み",
      故人: candidateOut(r.person),
      年: r.year,
      回忌: r.kaiki,
      呼び名: r.kaikiName,
      祥月命日: dateLabel(r.meinichi),
      チェック: {
        "1_故人の確認": c.identity.message,
        "2_回忌と年": { 結果: c.kaiki.ok ? "OK" : "注意", 内容: c.kaiki.message },
        "3_祥月命日": { 結果: c.meinichi.ok ? "OK" : "注意", 内容: c.meinichi.message },
        "4_複数霊位供養": { 結果: c.joint.candidates.length > 0 ? "提案あり" : "なし", 内容: c.joint.message },
      },
      複数霊位供養の候補: c.joint.candidates.map((j) => ({
        person_id: j.personId,
        俗名: j.name,
        法号: j.homyo,
        続柄: j.relation,
        回忌: j.kaiki,
        呼び名: j.kaikiName,
        祥月命日: dateLabel(j.meinichi),
      })),
      注意: r.warnings,
      次にすること:
        "結果（回忌、祥月命日、複数霊位供養の提案）を住職に伝え、あわせて営むかを確かめる。" +
        "そのあと find_memorial_slots に希望の時期と故人（person_ids）を渡して、候補の日時を出す",
    };
  },
});

// ---- find_memorial_slots ----

const findMemorialSlotsTool = defineReadTool({
  name: "find_memorial_slots",
  description:
    "法要の候補の日時を出す（法要の担当者 × 本堂）。希望の時期の中で、担当者が空いていて、お寺なら本堂も空いている開始時刻を、日ごとに並べる。" +
    "開始時刻はお寺の設定（10:00〜15:00、1 時間刻み）。お寺では本堂と担当者を「法要 40 分＋前後の準備と片付け 10 分ずつ」で押さえる。" +
    "自宅・墓前では本堂は見ず、担当者を「行きの移動時間＋法要＋帰りの移動時間」で押さえる（移動時間は必須。わからなければ住職に尋ねる）。" +
    "申請中の施設予約（前撮りなど）も埋まっているとみなす。祥月命日より前の日を先に並べる。" +
    "担当者を指定しなければ、開始時刻ごとに空いている担当者をすべて返す。" +
    "申し込み（list_memorial_requests）から日時を決めるときは memorial_request_id を渡せば、希望の時期・場所・故人を申し込みから取る。" +
    "住職が日時と担当者を選んだら（例: 「3/15 の 10 時、住職の担当で」）、book_memorial_service を呼ぶ。",
  input: {
    memorial_request_id: z.string().optional().describe("申し込みから候補を出すとき。希望の時期・場所・故人を申し込みから取る"),
    from: dateArg("希望の時期の始まり（YYYY-MM-DD）。申し込みを指定しないときは必須").optional(),
    to: dateArg("希望の時期の終わり（YYYY-MM-DD。この日を含む）。一度に 62 日まで").optional(),
    person_ids: z.array(z.string()).optional().describe("供養する故人の person_id（複数霊位供養なら全員）。祥月命日より前の日を先に並べるのに使う"),
    location: locationArg.optional().describe("場所: temple（お寺。本堂を押さえる）/ home（自宅）/ grave（墓前）。省略するとお寺（申し込みならその場所）"),
    officiant: z
      .array(z.string())
      .optional()
      .describe("法要の担当者を絞るとき（名前か役職。例: [\"住職\"]）。省略すると担当者全員（住職、副住職、執事長など）"),
    ...travelArgs,
  },
  handler: async (args, ctx) => {
    const { actor, now } = ctx;
    let periods: { from: string; to: string }[];
    let location: MemorialLocation = args.location ?? "temple";
    let personIds = args.person_ids ?? [];
    let req: MemorialRequestView | null = null;
    if (args.memorial_request_id) {
      req = await getMemorialRequest(actor, args.memorial_request_id);
      periods = args.from ? [{ from: args.from, to: args.to ?? args.from }] : req.preferredPeriods.map((p) => ({ from: p.from, to: p.to }));
      location = args.location ?? req.location;
      if (personIds.length === 0) personIds = req.targets.map((t) => t.personId);
    } else {
      if (!args.from) throw invalid("希望の時期（from と to）か、memorial_request_id を指定してください");
      periods = [{ from: args.from, to: args.to ?? args.from }];
    }
    if (periods.length === 0) throw invalid("申し込みに希望の時期がありません。from と to を指定してください");

    const r = await findMemorialSlots(actor, {
      periods,
      location,
      officiantStaffIds: await officiantIds(ctx, args.officiant),
      targetPersonIds: personIds,
      travelBeforeMin: args.travel_before_min,
      travelAfterMin: args.travel_after_min,
      now,
    });

    const byDate = new Map<string, typeof r.slots>();
    for (const s of r.slots) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
    const perOfficiant: Record<string, number> = {};
    for (const o of r.officiants) perOfficiant[`${o.roleTitle} ${o.name}`] = 0;
    for (const s of r.slots) for (const o of s.officiants) perOfficiant[`${o.roleTitle} ${o.name}`]++;

    const holdText =
      location === "temple"
        ? `本堂と担当者を、法要 ${r.durationMin} 分＋前後の準備と片付け ${r.bufferMin} 分ずつで押さえる`
        : `担当者を、行き ${r.travelBeforeMin} 分＋法要 ${r.durationMin} 分＋帰り ${r.travelAfterMin} 分で押さえる（本堂は見ない）`;

    return {
      条件: {
        期間: periods.map((p) => `${dateLabel(p.from)}〜${dateLabel(p.to)}`),
        場所: LOCATION_LABELS[location],
        押さえ方: holdText,
        調べた担当者: r.officiants.map((o) => `${o.roleTitle} ${o.name}`),
        申し込み: req ? { memorial_request_id: req.id, 世帯: req.householdName } : undefined,
      },
      祥月命日: r.meinichi.map((m) => `${m.name}: ${dateLabel(m.meinichi)}`),
      候補の件数: r.total,
      担当者ごとの候補の件数: perOfficiant,
      候補: [...byDate.entries()].map(([date, slots]) => ({
        日付: dateLabel(date),
        祥月命日より前: slots[0].beforeMeinichi,
        時刻: slots.map((s) => ({
          開始: jstTimeString(s.start),
          終了: jstTimeString(s.end),
          担当できる人: s.officiants.map((o) => `${o.roleTitle} ${o.name}`),
        })),
      })),
      注意: r.truncated ? `候補が多いので、先頭の ${r.slots.length} 件だけを返しました。期間を絞ってください` : undefined,
      次にすること:
        r.total === 0
          ? "この期間には候補がありません。期間を広げるか、担当者や場所を変えて呼び直す"
          : "候補を住職に伝え（祥月命日より前の日を勧める）、日時と担当者を選んでもらう。決まったら book_memorial_service を呼ぶ",
    };
  },
});

// ---- list_memorial_requests ----

function requestOut(r: MemorialRequestView) {
  return {
    memorial_request_id: r.id,
    受付: formatJst(r.createdAt),
    経路: REQUEST_SOURCE_LABELS[r.source],
    状態: REQUEST_STATUS_LABELS[r.status],
    世帯: { household_id: r.householdId, 名前: r.householdName, 住所: r.householdAddress, 電話: r.householdPhone },
    申し込んだ人: r.requestedByName ?? r.staffName,
    施主: r.seshuDisplay,
    故人: r.targets.map(targetOut),
    複数霊位供養: r.targets.length > 1,
    希望の時期: r.preferredPeriods.map(
      (p, i) => `第 ${i + 1} 希望: ${dateLabel(p.from)}〜${dateLabel(p.to)}${p.note ? `（${p.note}）` : ""}`,
    ),
    場所: LOCATION_LABELS[r.location],
    参列の人数: r.attendees,
    お斎: r.otoki === null ? null : r.otoki ? "あり" : "なし",
    連絡事項: r.notes,
    注意: r.warnings.length > 0 ? r.warnings : undefined,
    確定した法要: r.service
      ? {
          memorial_service_id: r.service.id,
          日時: formatJst(r.service.startAt),
          場所: LOCATION_LABELS[r.service.location],
          担当者: r.service.officiantName,
        }
      : null,
    お断りの理由: r.declineReason,
  };
}

const listMemorialRequestsTool = defineReadTool({
  name: "list_memorial_requests",
  description:
    "檀家ポータルや電話で受けた、法要の申し込みの一覧。「新しい法要の申し込みはある？」と聞かれたら、status を省略して（受付済みだけ）呼ぶ。" +
    "受付済みの申し込みは、古い順（先に来たものから）に並ぶ。故人ごとの回忌、希望の時期（第 1〜第 3 希望）、場所、参列の人数、お斎、連絡事項を返す。" +
    "日時を決めるときは find_memorial_slots に memorial_request_id を渡して候補を出し、住職が選んだら book_memorial_service に memorial_request_id を渡す。" +
    "断るときは decline_memorial_request（理由が必須）。",
  input: {
    status: z
      .enum(["requested", "scheduled", "declined", "all"])
      .optional()
      .describe("requested（受付済み。日時が未定）/ scheduled（確定）/ declined（お断り）/ all（すべて）。省略すると requested"),
    household_id: z.string().optional().describe("世帯で絞り込むときの household_id"),
  },
  handler: async ({ status, household_id }, { actor }) => {
    const s = status ?? "requested";
    const list = await listMemorialRequests(actor, {
      statuses: s === "all" ? undefined : [s],
      householdId: household_id,
      limit: 50,
    });
    return {
      件数: list.length,
      申し込み: list.map(requestOut),
      次にすること:
        list.length === 0
          ? undefined
          : "申し込みの内容を住職に伝える。日時を決めるなら find_memorial_slots に memorial_request_id を渡す",
    };
  },
});

// ---- book_memorial_service ----

const bookInput = {
  memorial_request_id: z
    .string()
    .optional()
    .describe("ポータルなどで受けた申し込みを確定するとき。指定すると、世帯・故人と回忌・場所・施主を申し込みから取る"),
  household_id: z.string().optional().describe("申し込みがないとき（電話で受けて、その場で確定するとき）は必須。verify_memorial の故人の世帯"),
  targets: z
    .array(z.object({ person_id: z.string().describe("故人の person_id"), kaiki: kaikiArg }))
    .optional()
    .describe("供養する故人と回忌（複数霊位供養なら全員）。申し込みがないときは必須。例: [{ person_id: 太郎, kaiki: 7 }, { person_id: キヨ, kaiki: 13 }]"),
  date: dateArg("法要の日（YYYY-MM-DD）"),
  time: timeArg,
  officiant: z.string().describe("法要の担当者（名前か役職。例: 「住職」「副住職」「執事長」）"),
  location: locationArg.optional().describe("場所: temple（お寺。本堂を押さえる）/ home（自宅）/ grave（墓前）。省略するとお寺（申し込みならその場所）"),
  ...travelArgs,
  seshu_person_id: z.string().optional().describe("施主（台帳の家族の person_id）。省略すると、申し込みの施主か、世帯の窓口"),
  seshu_name: z.string().optional().describe("施主が台帳にいない人のときの名前（seshu_person_id とどちらか 1 つ）"),
  duration_min: z.number().int().min(10).max(240).optional().describe("法要の長さ（分）。省略するとお寺の設定（40 分）"),
  notes: z.string().max(2000).optional().describe("メモ（担当者の予定にも載る）"),
};

type BookArgs = z.infer<z.ZodObject<typeof bookInput>>;

async function toBookingInput(args: BookArgs, ctx: ToolContext) {
  const [officiant] = await resolveStaff(ctx.actor.templeId, [args.officiant]);
  if (!officiant) throw invalid("法要の担当者を指定してください");
  return {
    memorialRequestId: args.memorial_request_id ?? null,
    householdId: args.household_id ?? null,
    targets: args.targets?.map((t) => ({ personId: t.person_id, kaiki: t.kaiki })) ?? null,
    location: args.location ?? null,
    start: jst(args.date, args.time),
    officiantStaffId: officiant.id,
    durationMin: args.duration_min ?? null,
    travelBeforeMin: args.travel_before_min ?? null,
    travelAfterMin: args.travel_after_min ?? null,
    seshuPersonId: args.seshu_person_id ?? null,
    seshuName: args.seshu_name ?? null,
    notes: args.notes ?? null,
  };
}

function previewOf(plan: MemorialBookingPlan): string {
  const officiant = `${plan.officiant.roleTitle} ${plan.officiant.name}`;
  const targets = plan.targets.map((t) => `${t.relation ?? ""} ${t.name}（${t.homyo ?? "法号なし"}）の${t.kaikiName}`).join("、");
  const holdNote =
    plan.location === "temple"
      ? `前後の準備と片付け ${plan.bufferMin} 分ずつを含む`
      : `行き ${plan.travelBeforeMin} 分・帰り ${plan.travelAfterMin} 分の移動時間を含む`;
  const lines = [
    "次の内容で法要を登録します（まだ登録していません）。",
    `■ 法要: ${plan.household.name} ${targets}${plan.joint ? `〔${JOINT_SERVICE_LABEL}〕` : ""}`,
    `  日時: ${formatJst(plan.start)}〜${jstTimeString(plan.end)}（${plan.durationMin} 分）`,
    `  場所: ${LOCATION_LABELS[plan.location]}${plan.location !== "temple" && plan.household.address ? `（${plan.household.address}）` : ""}`,
    `  法要の担当者: ${officiant}`,
    `  施主: ${plan.seshu.display ?? "（未定）"}`,
    `■ 担当者の予定: ${officiant}のカレンダーに「${plan.title}」（${rangeLabel(plan.hold)}、${holdNote}）を業務の予定として登録します`,
    plan.hall
      ? `■ ${plan.hall.name}の予約: ${rangeLabel(plan.hold)} を確定で押さえます（${holdNote}）`
      : "■ 本堂の予約: なし（自宅・墓前のため）",
    plan.request
      ? `■ 申し込み: ${plan.request.source === "portal" ? "ポータル" : "電話"}で ${formatJst(plan.request.createdAt)} に受けた申し込み${plan.request.requestedByName ? `（${plan.request.requestedByName}さん）` : ""}を「確定」にして、この法要とひもづけます`
      : "■ 申し込み: 電話の受付として、申し込み（確定）を新しく記録します",
  ];
  if (plan.notes) lines.push(`■ メモ: ${plan.notes}`);
  if (plan.warnings.length > 0) lines.push(...plan.warnings.map((w) => `【注意】${w}`));
  return lines.join("\n");
}

const bookMemorialServiceTool = defineWriteTool({
  name: "book_memorial_service",
  description:
    "法要を確定する。法要、法要の担当者の業務の予定、本堂の予約（お寺のとき）を 1 つの操作でまとめて登録する。" +
    "memorial_request_id を指定すれば、その申し込みを「確定」にする。指定しなければ、電話の受付として申し込みを自動で作る。" +
    "呼ぶ前に verify_memorial で故人と回忌を確かめ、find_memorial_slots で空いている日時を確かめておく。" +
    "自宅・墓前のときは、行きと帰りの移動時間（travel_before_min / travel_after_min）が必須（わからなければ住職に尋ねる。推測しない）。" +
    "呼ぶとプレビューと confirmation_id が返るだけで、まだ登録されない。プレビューを住職に見せ、了承を得てから confirm_action を呼ぶ。",
  input: bookInput,
  preview: async (args, ctx) => {
    const plan = await planMemorialBooking(ctx.actor, await toBookingInput(args, ctx), undefined, { now: ctx.now });
    return {
      summary: previewOf(plan),
      details: {
        世帯: plan.household.name,
        故人: plan.targets.map(targetOut),
        複数霊位供養: plan.joint,
        日時: `${formatJst(plan.start)}〜${jstTimeString(plan.end)}`,
        場所: LOCATION_LABELS[plan.location],
        法要の担当者: `${plan.officiant.roleTitle} ${plan.officiant.name}`,
        担当者の予定: rangeLabel(plan.hold),
        本堂の予約: plan.hall ? rangeLabel(plan.hold) : null,
        申し込み: plan.request ? { memorial_request_id: plan.request.id, 扱い: "確定にする" } : { 扱い: "電話の受付として新しく記録する" },
        注意: plan.warnings,
      },
    };
  },
  execute: async (args, ctx) => {
    const r = await bookMemorialService(ctx.actor, await toBookingInput(args, ctx), undefined, { now: ctx.now });
    const p = r.plan;
    return {
      法要: {
        memorial_service_id: r.serviceId,
        内容: p.title,
        故人: p.targets.map((t) => `${t.name} ${t.kaikiName}`),
        日時: `${formatJst(p.start)}〜${jstTimeString(p.end)}`,
        場所: LOCATION_LABELS[p.location],
        法要の担当者: `${p.officiant.roleTitle} ${p.officiant.name}`,
        施主: p.seshu.display,
      },
      担当者の予定: { staff_event_id: r.staffEventId, 時間: rangeLabel(p.hold) },
      本堂の予約: r.reservation
        ? { reservation_id: r.reservation.id, 申請番号: r.reservation.requestCode, 時間: rangeLabel(p.hold), 状態: "確定" }
        : null,
      申し込み: { memorial_request_id: r.requestId, 経路: p.request ? (p.request.source === "portal" ? "ポータル" : "電話") : "電話", 状態: "確定" },
      管理画面: `${appBaseUrl()}/admin/memorial/services/${r.serviceId}`,
      カレンダー: `${appBaseUrl()}/admin/calendar?date=${jstDateString(p.start)}`,
    };
  },
});

// ---- decline_memorial_request ----

const declineInput = {
  memorial_request_id: z.string().describe("list_memorial_requests で得た memorial_request_id"),
  reason: z
    .string()
    .min(1)
    .max(1000)
    .describe("お断りの理由（必須）。檀家ポータルで檀家さんにそのまま表示されるので、丁寧な言葉で書く"),
};

const declineMemorialRequestTool = defineWriteTool({
  name: "decline_memorial_request",
  description:
    "法要の申し込みを、理由を添えて断る（状態は「お断り」になる）。理由は必須で、檀家ポータルに「お断り」と一緒に表示される。" +
    "呼ぶとプレビューが返るだけなので、住職の了承を得てから confirm_action を呼ぶ。",
  input: declineInput,
  preview: async ({ memorial_request_id, reason }, { actor }) => {
    const r = await getMemorialRequest(actor, memorial_request_id);
    if (r.status !== "requested") throw invalid(`この申し込みは「${REQUEST_STATUS_LABELS[r.status]}」なので、お断りできません`);
    return {
      summary: [
        "次の申し込みをお断りします（まだ実行していません）。",
        `世帯: ${r.householdName}`,
        `故人: ${r.targets.map((t) => `${t.name} ${t.kaikiName}`).join("、")}`,
        `受付: ${formatJst(r.createdAt)}（${REQUEST_SOURCE_LABELS[r.source]}${r.requestedByName ? `、${r.requestedByName}さん` : ""}）`,
        `理由（ポータルに表示されます）: ${reason}`,
      ].join("\n"),
      details: { memorial_request_id: r.id, 世帯: r.householdName, 理由: reason },
    };
  },
  execute: async ({ memorial_request_id, reason }, { actor }) => {
    const r = await declineMemorialRequest(actor, memorial_request_id, reason);
    return { memorial_request_id: r.id, 世帯: r.householdName, 状態: REQUEST_STATUS_LABELS[r.status], 理由: r.declineReason };
  },
});

export const memorialTools: ToolDef[] = [
  verifyMemorialTool,
  findMemorialSlotsTool,
  listMemorialRequestsTool,
  bookMemorialServiceTool,
  declineMemorialRequestTool,
];
