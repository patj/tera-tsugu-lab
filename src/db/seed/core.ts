// 基盤（core）のシード: お寺とスタッフ。
// 名前: "staff:jushoku" / "staff:fukujushoku" / "staff:shitsujicho" / "staff:okusama" / "staff:jimuin" / "staff:baito"
import { staff, temples } from "../schema";
import { DEFAULT_TEMPLE_SETTINGS, hashPassword } from "@/domain/core";
import type { Db } from "../client";
import type { Seed } from "./context";

/** 開発用のパスワード（全員共通。README に書いてある） */
export const DEV_PASSWORD = "password";

export const SEED_STAFF = [
  { key: "jushoku", name: "高橋 日照", kana: "たかはし にっしょう", roleTitle: "住職", email: "jushoku@example.com", isOfficiant: true },
  { key: "fukujushoku", name: "高橋 日明", kana: "たかはし にちみょう", roleTitle: "副住職", email: "fukujushoku@example.com", isOfficiant: true },
  { key: "shitsujicho", name: "佐藤 隆", kana: "さとう たかし", roleTitle: "執事長", email: "shitsujicho@example.com", isOfficiant: true },
  { key: "okusama", name: "高橋 美和子", kana: "たかはし みわこ", roleTitle: "奥様", email: "okusama@example.com", isOfficiant: false },
  { key: "jimuin", name: "鈴木 恵", kana: "すずき めぐみ", roleTitle: "寺務員", email: "jimuin@example.com", isOfficiant: false },
  // アルバイトはログインしない（業務の予定は、ほかのスタッフが代わりに入れる）
  { key: "baito", name: "小林 葵", kana: "こばやし あおい", roleTitle: "アルバイト", email: null, isOfficiant: false },
] as const;

/** お寺を作る（シードの最初に呼ぶ。SeedContext を作る前に必要なので、ほかのシードとは別にする） */
export async function seedTemple(db: Db): Promise<string> {
  const [t] = await db
    .insert(temples)
    .values({ name: "妙縁寺", sect: "nichiren", settings: DEFAULT_TEMPLE_SETTINGS })
    .returning({ id: temples.id });
  return t.id;
}

export const coreSeed: Seed = {
  name: "core",
  async run(ctx) {
    const passwordHash = await hashPassword(DEV_PASSWORD);
    for (const [i, s] of SEED_STAFF.entries()) {
      const [row] = await ctx.db
        .insert(staff)
        .values({
          templeId: ctx.templeId,
          name: s.name,
          kana: s.kana,
          roleTitle: s.roleTitle,
          email: s.email,
          passwordHash: s.email ? passwordHash : null,
          isOfficiant: s.isOfficiant,
          position: i,
        })
        .returning({ id: staff.id });
      ctx.set(`staff:${s.key}`, row.id);
    }
  },
};
