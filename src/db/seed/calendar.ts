// スタッフのカレンダー（calendar）のシード: 2026 年 11 月〜2027 年 3 月の業務の予定と私的な予定。
// スタッフ（core のシード）だけに依存する。法要の予定は 04 のシードが bookMemorialService で作るので、ここでは作らない。
//
// 場面 0（2027 年 3 月中旬の法要の候補）のための予定:
// - 3/15（月）の 9:00〜12:30 は住職を空けておく（台本で「3/15 の 10 時、住職の担当で」と確定するため）
// - 同じ日の 10 時台は、副住職（私的な予定）と執事長（業務の予定）が埋まっている。住職は午後が埋まっている
// - 3/12〜3/21 に、法要の担当者の予定を散らしておく（候補に「空いていない時間」が混ざるように）
import { createPrivateEvent, createSharedEvent, type SharedEventCategory } from "@/domain/calendar";
import { addDays, getStaffById, jst, staffActor, type Actor } from "@/domain/core";
import type { Seed } from "./context";

type StaffKey = "jushoku" | "fukujushoku" | "shitsujicho" | "okusama" | "jimuin" | "baito";

const OFFICIANTS: StaffKey[] = ["jushoku", "fukujushoku", "shitsujicho"];
const ALL: StaffKey[] = ["jushoku", "fukujushoku", "shitsujicho", "okusama", "jimuin", "baito"];

/** [日付, 始まり, 終わり（翌日にまたがるときは "翌HH:MM"）, カテゴリ, タイトル, 担当者, 内容] */
type SharedRow = [string, string, string, SharedEventCategory, string, StaffKey[], string?];
/** [本人, 日付, 始まり, 終わり, タイトル, 内容] */
type PrivateRow = [Exclude<StaffKey, "baito">, string, string, string, string, string?];

const SHARED: SharedRow[] = [
  // ---- 2026 年 11 月（撮影の前後。自分の予定や日表示が空にならないように） ----
  ["2026-11-06", "10:00", "11:00", "来客", "仏具店の打ち合わせ", ["jushoku", "jimuin"], "本堂の幕の新調について"],
  ["2026-11-06", "13:00", "16:00", "外出", "宗務所の会議", ["fukujushoku"]],
  ["2026-11-07", "09:00", "12:00", "行事", "境内の清掃", ["shitsujicho", "baito"], "落ち葉の掃除と植木の手入れ"],
  ["2026-11-08", "13:00", "15:00", "行事", "写経会", ["jushoku", "okusama", "baito"], "参加は 12 名の予定。お茶の用意は奥様"],
  ["2026-11-09", "10:00", "12:00", "来客", "檀家総代との打ち合わせ", ["jushoku", "shitsujicho"], "年末年始の行事の段取り"],
  ["2026-11-09", "13:00", "17:00", "その他", "受付の手伝い", ["baito"]],
  ["2026-11-10", "14:00", "15:00", "外出", "銀行", ["jimuin"]],
  ["2026-11-11", "09:00", "17:00", "外出", "宗門の研修会", ["fukujushoku"]],
  ["2026-11-12", "10:00", "11:00", "来客", "石材店の来訪", ["shitsujicho"], "墓地の区画の修繕の見積もり"],
  ["2026-11-13", "13:00", "15:00", "その他", "会計の締め", ["jimuin", "okusama"]],
  ["2026-11-15", "10:00", "12:00", "行事", "七五三の祈願", ["jushoku", "fukujushoku", "baito"]],
  ["2026-11-20", "09:00", "17:00", "外出", "本山へ出張", ["jushoku"]],
  ["2026-11-25", "10:00", "11:30", "来客", "新聞社の取材", ["jushoku", "jimuin"], "地域面の「お寺の役割」の記事"],
  // ---- 12 月 ----
  ["2026-12-03", "13:00", "16:00", "外出", "宗務所の会議", ["fukujushoku"]],
  ["2026-12-10", "10:00", "12:00", "来客", "檀家総代との打ち合わせ", ["jushoku", "shitsujicho"]],
  ["2026-12-20", "09:00", "12:00", "行事", "すす払い", ALL, "本堂と庫裏の大掃除"],
  ["2026-12-28", "10:00", "15:00", "行事", "正月の飾りつけ", ["shitsujicho", "okusama", "baito"]],
  ["2026-12-31", "22:00", "翌01:00", "行事", "除夜の鐘", ["jushoku", "fukujushoku", "shitsujicho", "okusama", "baito"], "甘酒の用意は奥様とアルバイト"],
  // ---- 2027 年 1 月 ----
  ["2027-01-01", "09:00", "12:00", "行事", "修正会（元旦の祈祷）", [...OFFICIANTS, "jimuin"]],
  ["2027-01-08", "10:00", "12:00", "来客", "総代会の打ち合わせ", ["jushoku", "shitsujicho"]],
  ["2027-01-17", "11:00", "14:00", "行事", "檀信徒の新年会", ALL],
  ["2027-01-26", "13:00", "17:00", "外出", "宗務所の会議", ["fukujushoku"]],
  // ---- 2 月 ----
  ["2027-02-03", "10:00", "16:00", "行事", "節分会・星祭り", [...OFFICIANTS, "okusama", "jimuin", "baito"]],
  ["2027-02-15", "10:00", "11:30", "行事", "涅槃会", OFFICIANTS],
  ["2027-02-22", "13:00", "17:00", "外出", "宗務所の会議", ["fukujushoku"]],
  // ---- 3 月 ----
  ["2027-03-03", "10:00", "11:00", "来客", "春彼岸の塔婆の打ち合わせ", ["shitsujicho", "jimuin"]],
  ["2027-03-10", "13:00", "17:00", "外出", "宗務所の研修", ["fukujushoku"]],
  // 3 月中旬（場面 0 の候補に「空いていない時間」が混ざるように）
  ["2027-03-12", "09:00", "12:00", "外出", "市の仏教会の会合", ["jushoku"]],
  ["2027-03-12", "13:00", "16:00", "外出", "墓地の見回り", ["shitsujicho"]],
  ["2027-03-13", "13:00", "16:00", "行事", "塔婆書き", ["fukujushoku", "shitsujicho"]],
  ["2027-03-14", "10:00", "12:00", "来客", "檀家さんの相談", ["jushoku"]],
  ["2027-03-14", "13:00", "15:00", "外出", "葬儀社との打ち合わせ", ["shitsujicho"]],
  ["2027-03-15", "10:00", "12:00", "来客", "石材店と墓所の立ち会い", ["shitsujicho"]],
  ["2027-03-15", "13:00", "15:30", "外出", "役所の手続き", ["jushoku"]],
  ["2027-03-16", "10:00", "12:00", "外出", "宗務所の会議", ["fukujushoku"]],
  ["2027-03-17", "13:00", "16:00", "行事", "塔婆書き", ["jushoku", "fukujushoku"]],
  ["2027-03-18", "10:00", "11:00", "行事", "彼岸入りのお勤め", OFFICIANTS],
  ["2027-03-20", "10:00", "12:00", "行事", "春季彼岸会の準備", ALL],
  ["2027-03-21", "10:00", "15:00", "行事", "春季彼岸会（彼岸法要）", [...OFFICIANTS, "okusama", "jimuin", "baito"]],
  ["2027-03-27", "13:00", "15:00", "その他", "年度末の会計の締め", ["jimuin", "okusama"]],
];

const PRIVATE: PrivateRow[] = [
  // 住職（MCP の操作者なので、Claude Desktop では内容まで見える）
  ["jushoku", "2026-11-12", "08:30", "10:00", "通院（内科）", "定期の検診"],
  ["jushoku", "2026-12-15", "15:00", "17:00", "通院（内科）"],
  ["jushoku", "2027-03-16", "14:00", "15:30", "通院（歯科）"],
  // 副住職
  ["fukujushoku", "2026-11-14", "13:00", "18:00", "子どもの学芸会"],
  ["fukujushoku", "2027-01-23", "09:00", "17:00", "家族の用事"],
  ["fukujushoku", "2027-03-15", "09:30", "11:30", "通院", "検査の結果を聞く"],
  ["fukujushoku", "2027-03-19", "13:00", "17:00", "家族の用事"],
  // 執事長
  ["shitsujicho", "2026-11-18", "13:00", "15:00", "通院"],
  ["shitsujicho", "2027-03-16", "09:00", "17:00", "親戚の法事"],
  // 奥様
  ["okusama", "2026-11-07", "14:00", "17:00", "華道の稽古"],
  ["okusama", "2026-11-21", "10:00", "15:00", "実家へ"],
  ["okusama", "2026-12-15", "13:00", "15:00", "PTA の集まり"],
  ["okusama", "2027-02-10", "10:00", "12:00", "歯医者"],
  ["okusama", "2027-03-15", "13:00", "16:00", "華道の稽古"],
  // 寺務員
  ["jimuin", "2026-11-16", "09:00", "12:00", "役所の手続き（私用）"],
  ["jimuin", "2027-01-12", "13:00", "17:00", "通院"],
];

function endOf(date: string, end: string): Date {
  return end.startsWith("翌") ? jst(addDays(date, 1), end.slice(1)) : jst(date, end);
}

export const calendarSeed: Seed = {
  name: "calendar",
  async run(ctx) {
    const actors = new Map<StaffKey, Actor>();
    for (const key of ALL) {
      const s = await getStaffById(ctx.get(`staff:${key}`), ctx.db);
      if (!s) throw new Error(`スタッフが見つかりません: ${key}`);
      actors.set(key, staffActor(s, "web"));
    }

    for (const [date, start, end, category, title, assignees, body] of SHARED) {
      // 業務の予定は、寺務員（ふだん予定を入れる人）が作ったことにする
      await createSharedEvent(actors.get("jimuin")!, ctx.db, {
        category,
        title,
        body: body ?? null,
        start: jst(date, start),
        end: endOf(date, end),
        assigneeStaffIds: assignees.map((k) => ctx.get(`staff:${k}`)),
      });
    }

    // 私的な予定は本人が作る（アルバイトはログインしないので、私的な予定を持たない。spec.md §3.2）
    for (const [who, date, start, end, title, body] of PRIVATE) {
      await createPrivateEvent(
        actors.get(who)!,
        { category: "私用", title, body: body ?? null, start: jst(date, start), end: endOf(date, end) },
        ctx.db,
      );
    }
  },
};
