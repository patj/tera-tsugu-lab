// 台帳（ledger）の MCP ツール（spec.md §4）: search_households、get_household、search_deceased、
// list_upcoming_memorials、add_contact_log
import { z } from "zod";
import { db } from "@/db/client";
import { formatJst, getStaffById, invalid, jstDateString, parseDateString } from "@/domain/core";
import {
  addContactLog,
  CONTACT_LOG_KINDS,
  GENDER_LABELS,
  getHousehold,
  listUpcomingMemorials,
  searchDeceased,
  searchHouseholds,
  type Gender,
  type MemorialOccurrence,
} from "@/domain/ledger";
import { defineReadTool, defineWriteTool, type ToolDef } from "../framework/define";

const genderLabel = (g: string | null) => (g ? (GENDER_LABELS[g as Gender] ?? g) : null);
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
    "同じ名字の世帯が複数あることがあるので、候補が複数なら住所や世帯主で住職に確かめる。" +
    "結果の household_id を get_household や add_contact_log に使う。",
  input: {
    query: z.string().describe("検索の語（例: 「田中」「本町」「0422-55」）。空にするとすべての世帯"),
    status: z
      .enum(["active", "left", "moved"])
      .optional()
      .describe("世帯の状態で絞り込む: active（檀家）/ left（離檀）/ moved（転出）。省略するとすべて"),
  },
  handler: async ({ query, status }, { actor }) => {
    const list = await searchHouseholds(actor, query, { status, limit: 50 });
    return {
      件数: list.length,
      世帯: list.map((h) => ({
        household_id: h.id,
        名前: h.name,
        住所: h.address,
        電話: h.phone,
        状態: h.statusLabel,
        世帯主: h.head?.name ?? null,
        窓口: h.contact?.name ?? null,
      })),
    };
  },
});

const getHouseholdTool = defineReadTool({
  name: "get_household",
  description:
    "世帯の詳細を返す: 住所と電話、世帯主と窓口、生きている家族、故人（法号、俗名、没年月日、享年、次の年忌）、直近の対応記録。" +
    "窓口は、家を代表してお寺とやりとりする人（世帯主とは別のことがある）。",
  input: { household_id: z.string().describe("search_households で得た household_id") },
  handler: async ({ household_id }, { actor, now }) => {
    const h = await getHousehold(actor, household_id, { today: jstDateString(now) });
    return {
      household_id: h.id,
      名前: h.name,
      状態: h.statusLabel,
      住所: h.address,
      電話: h.phone,
      世帯主: h.head?.name ?? null,
      窓口: h.contact?.name ?? null,
      家族: h.members.map((m) => ({
        person_id: m.id,
        氏名: m.name,
        カナ: m.kana,
        続柄: m.relation,
        性別: genderLabel(m.gender),
        生年月日: m.birthDate,
        携帯: m.mobilePhone,
        世帯主: m.isHead,
        窓口: m.isContact,
      })),
      故人: h.deceased.map((d) => ({
        person_id: d.id,
        法号: d.homyo,
        俗名: d.name,
        続柄: d.relation,
        没年月日: d.deathDate,
        享年: d.ageAtDeath,
        次の年忌: memorialLabel(d.nextMemorial),
      })),
      直近の対応記録: h.contactLogs.map((l) => ({
        日時: formatJst(l.createdAt),
        種類: l.kind,
        内容: l.body,
        記録者: l.staffName,
      })),
    };
  },
});

const searchDeceasedTool = defineReadTool({
  name: "search_deceased",
  description:
    "故人を、俗名、法号、世帯、続柄（世帯主から見た関係。例: 「父」）で検索する。候補をすべて返し、1 人に絞らない。" +
    "候補が複数あるときは、法号と没年と世帯を並べて住職に確かめ、自分で 1 人に決めない（故人の取り違えを防ぐため）。",
  input: {
    name: z.string().optional().describe("俗名の一部（姓、名、カナ）。例: 「山田」「山田太郎」"),
    homyo: z.string().optional().describe("法号の一部"),
    household_id: z.string().optional().describe("世帯で絞り込むときの household_id"),
    relation: z.string().optional().describe("続柄（世帯主から見た関係）。例: 「父」「母」「祖母」"),
  },
  handler: async ({ name, homyo, household_id, relation }, { actor, now }) => {
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
      注意: list.length > 1 ? "候補が複数あります。法号と没年を住職に確かめてください" : undefined,
      候補: list.map((c) => ({
        person_id: c.personId,
        法号: c.homyo,
        俗名: c.name,
        没年月日: c.deathDate,
        没年: c.deathYear,
        享年: c.ageAtDeath,
        続柄: c.relation,
        世帯: { household_id: c.household.id, 名前: c.household.name, 住所: c.household.address, 状態: c.household.statusLabel },
        次の年忌: memorialLabel(c.nextMemorial),
      })),
    };
  },
});

const listUpcomingMemorialsTool = defineReadTool({
  name: "list_upcoming_memorials",
  description:
    "期間を指定して、年忌を迎える故人を回忌ごとにまとめて返す。その年の祥月命日が期間に入る故人を数える（離檀・転出の世帯は除く）。" +
    "「来月」と聞かれたら、whoami で今日の日付を確かめ、来月の 1 日から末日までを指定する。" +
    "同じ世帯で同じ年に年忌を迎える故人がほかにいれば「同じ年に年忌を迎える家族」に入る（複数霊位供養を提案できる）。",
  input: {
    from: dateArg("期間の始まり（YYYY-MM-DD。この日を含む）"),
    to: dateArg("期間の終わり（YYYY-MM-DD。この日を含む）"),
  },
  handler: async ({ from, to }, { actor }) => {
    const r = await listUpcomingMemorials(actor, { from, to });
    return {
      期間: `${r.from}〜${r.to}`,
      合計: r.total,
      回忌ごと: r.groups.map((g) => ({
        回忌: g.kaiki,
        呼び名: g.kaikiName,
        人数: g.count,
        故人: g.items.map((i) => ({
          person_id: i.personId,
          法号: i.homyo,
          俗名: i.name,
          続柄: i.relation,
          没年月日: i.deathDate,
          祥月命日: i.meinichi,
          世帯: {
            household_id: i.household.id,
            名前: i.household.name,
            電話: i.household.phone,
            窓口: i.household.contactPersonName,
          },
          同じ年に年忌を迎える家族: i.sameYearInHousehold.map((o) => ({
            person_id: o.personId,
            俗名: o.name,
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
  preview: async ({ household_id, kind, body }, { actor, now }) => {
    const h = await getHousehold(actor, household_id, { today: jstDateString(now), contactLogLimit: 0 });
    const me = await getStaffById(actor.staffId);
    const recorder = me ? `${me.roleTitle} ${me.name}` : actor.label;
    return {
      summary: [
        `${h.name}（${h.address ?? "住所なし"}）に対応記録を追加します。`,
        `種類: ${kind}`,
        `内容: ${body}`,
        `記録者: ${recorder}`,
      ].join("\n"),
      details: { household_id: h.id, 世帯: h.name, 種類: kind, 内容: body, 記録者: recorder },
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
