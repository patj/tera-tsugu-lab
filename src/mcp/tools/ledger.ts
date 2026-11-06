// 台帳（ledger）の MCP ツール（spec.md §4）: search_households、get_household、search_deceased、
// list_upcoming_memorials、add_contact_log
// LLM には名前を返さない（家の名前は検索語と合うときだけ）。住所は町名まで。電話、携帯、生年月日、対応記録の本文も返さず、管理画面の URL を添える（spec.md §4）
import { z } from "zod";
import { db } from "@/db/client";
import { formatJst, getStaffById, invalid, jstDateString, parseDateString } from "@/domain/core";
import {
  addContactLog,
  CONTACT_LOG_KINDS,
  getHousehold,
  listUpcomingMemorials,
  searchDeceased,
  searchHouseholds,
  type MemorialOccurrence,
} from "@/domain/ledger";
import { defineReadTool, defineWriteTool, type ToolDef } from "../framework/define";
import { adminUrl, areaOf, householdLabel, householdNameIfAsked, relationLabel } from "../framework/present";

const householdUrl = (id: string) => adminUrl(`/admin/ledger/households/${id}`);
const yearOf = (date: string | null) => (date ? Number(date.slice(0, 4)) : null);
const memorialLabel = (m: MemorialOccurrence | null) =>
  m ? { 回忌: m.kaiki, 呼び名: m.kaikiName, 年: m.year, 祥月命日: m.meinichi } : null;

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

const searchHouseholdsTool = defineReadTool({
  name: "search_households",
  description:
    "世帯（檀家の家）を検索する。世帯の名前、家族の氏名やカナ、住所、電話番号（固定電話と家族の携帯）で探す。" +
    "家の名前は、検索語と家の名前が合う家（「田中」で探した田中家）だけ返す。町名、電話番号、家族の名前で当たった家は、" +
    "件数と household_id と管理画面の URL だけを返すので、どの家かは住職に管理画面で確かめてもらう（名前を推測しない）。" +
    "同じ名字の家が複数あれば、地域（町名）で住職に確かめる。結果の household_id を get_household や add_contact_log に使う。" +
    "世帯主や窓口の名前、住所の番地、電話番号は返さない。",
  input: {
    query: z.string().describe("検索の語（例: 「田中」「本町」「0422-55」）。空にするとすべての世帯"),
    status: z
      .enum(["active", "left", "moved"])
      .optional()
      .describe("世帯の状態で絞り込む: active（檀家）/ left（離檀）/ moved（転出）。省略するとすべて"),
  },
  handler: async (args, { actor }) => {
    const { query, status } = args;
    const list = await searchHouseholds(actor, query, { status, limit: 50 });
    const named = list.filter((h) => householdNameIfAsked(h.name, args));
    const others = list.filter((h) => !householdNameIfAsked(h.name, args));
    const listUrl = adminUrl(`/admin/ledger?q=${encodeURIComponent(query)}${status ? `&status=${status}` : ""}`);
    return {
      件数: list.length,
      世帯: named.map((h) => ({
        household_id: h.id,
        名前: h.name,
        地域: areaOf(h.address),
        状態: h.statusLabel,
        管理画面: householdUrl(h.id),
      })),
      ...(others.length > 0
        ? {
            名前を伏せた世帯: {
              件数: others.length,
              説明:
                named.length > 0
                  ? "家族の名前などで当たったほかの世帯です。名前は返しません。管理画面で確かめてください"
                  : "検索語が家の名前ではないので、名前は返しません。どの家かは管理画面で確かめてください",
              household_id: others.map((h) => h.id),
            },
          }
        : {}),
      管理画面: listUrl,
    };
  },
});

const getHouseholdTool = defineReadTool({
  name: "get_household",
  description:
    "世帯の詳細を返す: 地域（町名）、状態、生きている家族（続柄と、世帯主・窓口の印）、故人（続柄、没年、次の年忌）、" +
    "直近の対応記録（日時、種類、記録者）。窓口は、家を代表してお寺とやりとりする人（世帯主とは別のことがある）。" +
    "家の名前、家族と故人の名前、法号、住所の番地、電話、携帯、生年月日、対応記録の本文は返さない。" +
    "人は person_id と続柄で指す（「窓口（長男）」）。住職に名前や法号を聞かれたら「管理画面」の URL を案内する（推測して答えない）。" +
    "住職が家の名前を言っていれば、会話ではその名前を使ってよい。",
  input: { household_id: z.string().describe("search_households などで得た household_id") },
  handler: async ({ household_id }, { actor, now }) => {
    const h = await getHousehold(actor, household_id, { today: jstDateString(now) });
    const roleOf = (flag: "isHead" | "isContact") => {
      const m = h.members.find((x) => x[flag]);
      return m ? relationLabel(m.relation) : null;
    };
    return {
      household_id: h.id,
      世帯: `${areaOf(h.address) ?? "地域不明"}の世帯`,
      状態: h.statusLabel,
      地域: areaOf(h.address),
      世帯主: roleOf("isHead"),
      窓口: roleOf("isContact"),
      家族: h.members.map((m) => ({
        person_id: m.id,
        続柄: m.relation,
        世帯主: m.isHead,
        窓口: m.isContact,
      })),
      故人: h.deceased.map((d) => ({
        person_id: d.id,
        続柄: d.relation,
        没年: yearOf(d.deathDate),
        次の年忌: memorialLabel(d.nextMemorial),
      })),
      直近の対応記録: h.contactLogs.map((l) => ({
        日時: formatJst(l.createdAt),
        種類: l.kind,
        記録者: l.staffName,
      })),
      管理画面: householdUrl(h.id),
      注意: "家の名前、家族と故人の名前、法号、住所の番地、電話、生年月日、対応記録の本文は、管理画面で確認してください",
    };
  },
});

const searchDeceasedTool = defineReadTool({
  name: "search_deceased",
  description:
    "故人を、俗名、法号、世帯、続柄（世帯主から見た関係。例: 「父」）で検索する。候補をすべて返し、1 人に絞らない。" +
    "候補は、続柄・没年・世帯の地域（町名）・次の年忌で返す（俗名と法号は返さない。家の名前は、検索語と合うときだけ）。" +
    "候補が複数あるときは、地域と続柄と没年を並べて住職に確かめ、自分で 1 人に決めない（故人の取り違えを防ぐため）。",
  input: {
    name: z.string().optional().describe("俗名の一部（姓、名、カナ）。例: 「山田」「山田太郎」"),
    homyo: z.string().optional().describe("法号の一部"),
    household_id: z.string().optional().describe("世帯で絞り込むときの household_id"),
    relation: z.string().optional().describe("続柄（世帯主から見た関係）。例: 「父」「母」「祖母」"),
  },
  handler: async (args, { actor, now }) => {
    const { name, homyo, household_id, relation } = args;
    if (!name && !homyo && !household_id && !relation) {
      throw invalid("俗名、法号、世帯、続柄のどれかを指定してください");
    }
    const list = await searchDeceased(actor, {
      name,
      homyo,
      householdId: household_id,
      relation,
      limit: 50,
      today: jstDateString(now),
    });
    return {
      件数: list.length,
      注意: list.length > 1 ? "候補が複数あります。世帯の地域と続柄と没年を住職に確かめてください" : undefined,
      候補: list.map((c) => ({
        person_id: c.personId,
        続柄: c.relation,
        没年: c.deathYear,
        世帯: {
          household_id: c.household.id,
          呼び方: householdLabel(c.household, args),
          地域: areaOf(c.household.address),
          状態: c.household.statusLabel,
          管理画面: householdUrl(c.household.id),
        },
        次の年忌: memorialLabel(c.nextMemorial),
      })),
    };
  },
});

const listUpcomingMemorialsTool = defineReadTool({
  name: "list_upcoming_memorials",
  description:
    "期間（と回忌）を指定して、年忌を迎える故人の人数を回忌ごとにまとめて返す。その年の祥月命日が期間に入る故人を数える（離檀・転出の世帯は除く）。" +
    "名前（家、窓口、故人の俗名、法号）は返さない。返事では人数と、続柄・祥月命日・目印を伝え、お名前は「管理画面」の URL で見てもらう。" +
    "「来月」と聞かれたら、whoami で今日の日付を確かめ、来月の 1 日から末日までを指定する。「今年の三回忌」なら kaiki = 3。" +
    "「同じ年に年忌を迎える家族」があれば、複数霊位供養を提案できる。祥月命日を過ぎた方は「祥月命日を過ぎた」が true。",
  input: {
    from: dateArg("期間の始まり（YYYY-MM-DD。この日を含む）"),
    to: dateArg("期間の終わり（YYYY-MM-DD。この日を含む）"),
    kaiki: z
      .number()
      .int()
      .min(2)
      .max(100)
      .optional()
      .describe("回忌で絞るとき（一周忌は 2、三回忌は 3、七回忌は 7）。省略するとすべての回忌"),
  },
  handler: async ({ from, to, kaiki }, { actor, now }) => {
    const r = await listUpcomingMemorials(actor, { from, to, kaiki });
    const today = jstDateString(now);
    return {
      期間: `${r.from}〜${r.to}`,
      合計: r.total,
      管理画面: adminUrl(`/admin/ledger/memorials?from=${r.from}&to=${r.to}${kaiki ? `&kaiki=${kaiki}` : ""}`),
      注意: "家の名前、窓口、故人の名前と法号、連絡先は返していません。管理画面の一覧で確認してください",
      回忌ごと: r.groups.map((g) => ({
        回忌: g.kaiki,
        呼び名: g.kaikiName,
        人数: g.count,
        故人: g.items.map((i) => ({
          person_id: i.personId,
          household_id: i.household.id,
          続柄: i.relation,
          没年: yearOf(i.deathDate),
          祥月命日: i.meinichi,
          祥月命日を過ぎた: i.meinichi < today,
          同じ年に年忌を迎える家族: i.sameYearInHousehold.map((o) => ({
            person_id: o.personId,
            呼び名: o.kaikiName,
            祥月命日: o.meinichi,
          })),
        })),
      })),
    };
  },
});

const addContactLogInput = {
  household_id: z.string().describe("search_households で得た household_id"),
  kind: z.enum(CONTACT_LOG_KINDS).describe("種類: 案内 / 電話 / 来寺 / その他"),
  body: z.string().min(1).max(2000).describe("内容（例: 「三回忌のご案内をした」）"),
};

const addContactLogTool = defineWriteTool({
  name: "add_contact_log",
  description:
    "世帯に対応記録（案内した、電話を受けた、来寺された、など）を追加する。記録者は操作者（MCP_ACTOR のスタッフ）になる。",
  input: addContactLogInput,
  preview: async (args, { actor, now }) => {
    const { household_id, kind, body } = args;
    const h = await getHousehold(actor, household_id, { today: jstDateString(now), contactLogLimit: 0 });
    const me = await getStaffById(actor.staffId);
    const recorder = me ? `${me.roleTitle} ${me.name}` : actor.label;
    const label = householdLabel(h, args);
    return {
      summary: [
        `${label}に対応記録を追加します。`,
        `種類: ${kind}`,
        `内容: ${body}`,
        `記録者: ${recorder}`,
        `世帯の管理画面: ${householdUrl(h.id)}`,
      ].join("\n"),
      details: { household_id: h.id, 世帯: label, 種類: kind, 内容: body, 記録者: recorder },
    };
  },
  execute: async ({ household_id, kind, body }, { actor }) => {
    const log = await db.transaction((tx) => addContactLog(actor, tx, { householdId: household_id, kind, body }));
    return { 対応記録: { 日時: formatJst(log.createdAt), 種類: log.kind, 内容: log.body, 記録者: log.staffName } };
  },
});

export const ledgerTools: ToolDef[] = [
  searchHouseholdsTool,
  getHouseholdTool,
  searchDeceasedTool,
  listUpcomingMemorialsTool,
  addContactLogTool,
];
