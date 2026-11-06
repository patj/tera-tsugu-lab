// 檀家ポータル（portal）のシード: アカウントと招待コード。
// 名前（アカウント）: "portal:tanaka_contact"（田中 健一。窓口）、"portal:tanaka_head"（田中 一郎。家族。can_view_household をオン）、
//   "portal:yamada_head"（山田 健。窓口）
// 名前（未使用の招待コード）: "portal_invite:tanaka_son_wife"、"portal_invite:yamada_wife"、"portal_invite:yamada_daughter"、
//   "portal_invite:sato_head"。期限切れの招待コード: "portal_invite:ito_head_expired"
// - アカウントには、登録に使った（使用済みの）招待コードもつける
// - ログインはメールアドレスで行う（マジックリンクは開発用の画面に表示する）。docs/tasks/06-portal.md に一覧がある
// - 対応記録（contact_logs）は作らない
import { jst } from "@/domain/core";
import { INVITE_EXPIRES_DAYS, newInviteCode } from "@/domain/portal/codes";
import { portalAccounts, portalInvites } from "../schema";
import type { Seed } from "./context";

const DAY_MS = 24 * 60 * 60 * 1000;

export const SEED_PORTAL_ACCOUNTS = [
  {
    key: "portal:tanaka_contact",
    person: "person:tanaka:son",
    email: "kenichi.tanaka@example.com",
    canViewHousehold: false,
    canApplyMemorial: false,
    registeredAt: "2026-06-12 20:15",
    lastLoginAt: "2026-10-28 21:03",
  },
  {
    key: "portal:tanaka_head",
    person: "person:tanaka:head",
    email: "ichiro.tanaka@example.com",
    canViewHousehold: true,
    canApplyMemorial: false,
    registeredAt: "2026-06-20 10:40",
    lastLoginAt: "2026-10-05 09:12",
  },
  {
    key: "portal:yamada_head",
    person: "person:yamada:head",
    email: "ken.yamada@example.com",
    canViewHousehold: false,
    canApplyMemorial: false,
    registeredAt: "2026-07-03 19:22",
    lastLoginAt: "2026-10-30 22:45",
  },
] as const;

/** 未使用の招待コード（手で入力する例として、決まった値にする。表示は XXXX-XXXX） */
export const SEED_PORTAL_INVITES = [
  { key: "portal_invite:tanaka_son_wife", person: "person:tanaka:son_wife", code: "TNKMSK26" },
  { key: "portal_invite:yamada_wife", person: "person:yamada:wife", code: "YMDYUM27" },
  { key: "portal_invite:yamada_daughter", person: "person:yamada:daughter", code: "YMDSKR28" },
  { key: "portal_invite:sato_head", person: "person:sato:head", code: "STHD2345" },
] as const;

/** 期限切れの招待コード（管理画面の一覧と、拒否の確認に使う） */
export const SEED_EXPIRED_INVITE = { key: "portal_invite:ito_head_expired", person: "person:ito:head", code: "EXPD2345" } as const;

export const portalSeed: Seed = {
  name: "portal",
  async run(ctx) {
    const now = new Date();
    for (const a of SEED_PORTAL_ACCOUNTS) {
      const [date, time] = a.registeredAt.split(" ");
      const registeredAt = jst(date, time);
      const personId = ctx.get(a.person);
      // 登録に使った招待コード（使用済み）
      await ctx.db.insert(portalInvites).values({
        templeId: ctx.templeId,
        personId,
        code: newInviteCode(),
        expiresAt: new Date(registeredAt.getTime() + INVITE_EXPIRES_DAYS * DAY_MS),
        usedAt: registeredAt,
        createdAt: new Date(registeredAt.getTime() - 7 * DAY_MS),
      });
      const [ld, lt] = a.lastLoginAt.split(" ");
      const [row] = await ctx.db
        .insert(portalAccounts)
        .values({
          templeId: ctx.templeId,
          personId,
          email: a.email,
          canViewHousehold: a.canViewHousehold,
          canApplyMemorial: a.canApplyMemorial,
          lastLoginAt: jst(ld, lt),
          createdAt: registeredAt,
        })
        .returning({ id: portalAccounts.id });
      ctx.set(a.key, row.id);
    }

    for (const inv of SEED_PORTAL_INVITES) {
      const [row] = await ctx.db
        .insert(portalInvites)
        .values({
          templeId: ctx.templeId,
          personId: ctx.get(inv.person),
          code: inv.code,
          expiresAt: new Date(now.getTime() + INVITE_EXPIRES_DAYS * DAY_MS),
          createdAt: now,
        })
        .returning({ id: portalInvites.id });
      ctx.set(inv.key, row.id);
    }

    const [expired] = await ctx.db
      .insert(portalInvites)
      .values({
        templeId: ctx.templeId,
        personId: ctx.get(SEED_EXPIRED_INVITE.person),
        code: SEED_EXPIRED_INVITE.code,
        expiresAt: new Date(now.getTime() - DAY_MS),
        createdAt: new Date(now.getTime() - (INVITE_EXPIRES_DAYS + 1) * DAY_MS),
      })
      .returning({ id: portalInvites.id });
    ctx.set(SEED_EXPIRED_INVITE.key, expired.id);
  },
};
