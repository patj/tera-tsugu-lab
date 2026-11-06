// 行事・アンケートフォーム（forms）のシード: 過去の行事（花まつり。締め切り、回答あり）。
// 名前: "form:hanamatsuri"
// - 回答は一般の方（共通リンク）だけ。台帳のシードは並列で作っているため、世帯にひもづく回答は入れない
// - ほうろく灸のフォームは、デモで MCP から作るので入れない
import { eq } from "drizzle-orm";
import { formResponses, forms } from "../schema";
import { jst } from "@/domain/core";
import { createForm, publicRespondentActor, setFormStatus, submitResponse } from "@/domain/forms";
import type { Seed } from "./context";

const PUBLIC_RESPONSES: { at: string; name: string; phone: string; address: string; people: [string, string][] }[] = [
  { at: "2026-03-18 10:12", name: "佐々木 恵子", phone: "090-1111-0001", address: "東京都台東区谷中 2-1-5", people: [["佐々木 恵子", "ササキ ケイコ"], ["佐々木 陽向", "ササキ ヒナタ"]] },
  { at: "2026-03-22 19:40", name: "井上 健", phone: "080-2222-0002", address: "東京都文京区千駄木 3-4-1", people: [["井上 健", "イノウエ ケン"], ["井上 美咲", "イノウエ ミサキ"], ["井上 蓮", "イノウエ レン"]] },
  { at: "2026-03-29 08:05", name: "木村 和子", phone: "03-5555-0003", address: "東京都荒川区西日暮里 1-9-2", people: [["木村 和子", "キムラ カズコ"]] },
  { at: "2026-04-02 13:30", name: "林 大輔", phone: "090-3333-0004", address: "東京都台東区根岸 5-2-8", people: [["林 結衣", "ハヤシ ユイ"], ["林 湊", "ハヤシ ミナト"]] },
  { at: "2026-04-05 16:48", name: "清水 由美", phone: "070-4444-0005", address: "東京都北区田端 6-3-3", people: [["清水 由美", "シミズ ユミ"]] },
];

export const formsSeed: Seed = {
  name: "forms",
  async run(ctx) {
    const form = await createForm(
      ctx.actor,
      {
        title: "花まつり 稚児行列 申し込み（2026 年）",
        description: "4 月 8 日（水）10 時から、お釈迦さまのお誕生をお祝いする稚児行列を行います。申込者は 3 人までご記入ください。",
        mode: "both",
        status: "open",
        questions: [
          { type: "short", label: "代表者のお名前", required: true, profileField: "name" },
          { type: "short", label: "ご住所", required: true, profileField: "address" },
          { type: "short", label: "電話番号", required: true, profileField: "phone" },
          {
            type: "person_list",
            label: "申込者",
            required: true,
            maxPersons: 3,
            itemFields: [
              { label: "氏名", type: "short", required: true, profileField: "name" },
              { label: "ふりがな", type: "short", required: true, profileField: "kana" },
            ],
          },
          { type: "single", label: "甘茶のお持ち帰り", options: ["希望する", "希望しない"] },
        ],
      },
      ctx.db,
    );
    ctx.set("form:hanamatsuri", form.id);
    const [nameQ, addressQ, phoneQ, peopleQ, teaQ] = form.questions;
    const actor = publicRespondentActor(ctx.templeId);
    for (const [i, r] of PUBLIC_RESPONSES.entries()) {
      const { id } = await submitResponse(
        actor,
        form.id,
        {
          source: "public",
          answers: {
            [nameQ.id]: r.name,
            [addressQ.id]: r.address,
            [phoneQ.id]: r.phone,
            [peopleQ.id]: r.people.map(([name, kana]) => ({ values: { name, kana } })),
            [teaQ.id]: i % 2 === 0 ? "希望する" : "希望しない",
          },
        },
        ctx.db,
      );
      const [date, time] = r.at.split(" ");
      await ctx.db.update(formResponses).set({ createdAt: jst(date, time) }).where(eq(formResponses.id, id));
    }
    await setFormStatus(ctx.actor, form.id, "closed", ctx.db);
    await ctx.db
      .update(forms)
      .set({ createdAt: jst("2026-03-10", "09:00"), updatedAt: jst("2026-04-08", "18:00") })
      .where(eq(forms.id, form.id));
  },
};
