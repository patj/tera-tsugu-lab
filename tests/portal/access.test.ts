// ポータルの権限（ドメイン層の判定）: 窓口、家族の権限、他の家、窓口の交代、スタッフの代行
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { auditLogs, contactLogs, portalAccounts } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { SEED_PORTAL_INVITES } from "@/db/seed/portal";
import { portalActor, type Actor } from "@/domain/core";
import { setHouseholdRoles, updatePerson } from "@/domain/ledger";
import {
  applyMemorial,
  getMemorialApplyOptions,
  getPortalAvailability,
  getPortalContext,
  getPortalEventForm,
  getPortalFamilyTree,
  getPortalMemorialSchedule,
  listFamilyPermissions,
  listPortalAccounts,
  listPortalEventResponses,
  listPortalEvents,
  listPortalInvites,
  listPortalMemorialRequests,
  registerWithInvite,
  resolvePermissions,
  setFamilyPermissions,
  setFamilyPermissionsByStaff,
  toPortalActor,
} from "@/domain/portal";
import { resetDb } from "../helpers/db";
import { portalOf, rejects, staffOf } from "./helpers";

let seed: SeedContext;
let kenichi: Actor; // 田中家の窓口
let ichiro: Actor; // 田中家の家族（can_view_household）
let ken: Actor; // 山田家の窓口

const TODAY = "2026-11-06";
const period = { from: "2027-03-01", to: "2027-03-31" };

async function registerMisaki(): Promise<Actor> {
  const code = SEED_PORTAL_INVITES.find((i) => i.key === "portal_invite:tanaka_son_wife")!.code;
  const r = await registerWithInvite({ code, email: "misaki.tanaka@example.com" });
  return toPortalActor(r.account);
}

async function accountFlags(id: string) {
  const [a] = await db.select().from(portalAccounts).where(eq(portalAccounts.id, id));
  return { canViewHousehold: a.canViewHousehold, canApplyMemorial: a.canApplyMemorial };
}

describe("ポータルの権限", () => {
  beforeEach(async () => {
    seed = await resetDb();
    kenichi = await portalOf(seed, "portal:tanaka_contact");
    ichiro = await portalOf(seed, "portal:tanaka_head");
    ken = await portalOf(seed, "portal:yamada_head");
  });
  after(async () => {
    await closeDb();
  });

  describe("立場の判定", () => {
    it("窓口は世帯の contact_person_id で決まる（世帯主の一郎さんではなく、長男の健一さん）", async () => {
      const k = await getPortalContext(kenichi);
      assert.equal(k.role, "contact");
      assert.deepEqual(k.can, { viewHousehold: true, applyMemorial: true, manageFamily: true, viewHouseholdResponses: true });
      const i = await getPortalContext(ichiro);
      assert.equal(i.role, "family");
      assert.equal(i.person.isHead, true);
      assert.deepEqual(i.can, { viewHousehold: true, applyMemorial: false, manageFamily: false, viewHouseholdResponses: false });
      const y = await getPortalContext(ken);
      assert.equal(y.role, "contact");
      assert.equal(y.household.id, seed.get("household:yamada"));
    });

    it("できることの表（純粋な関数）", () => {
      const h = { contactPersonId: "p1" };
      const off = { canViewHousehold: false, canApplyMemorial: false };
      assert.deepEqual(resolvePermissions({ personId: "p1", ...off }, h).can, {
        viewHousehold: true,
        applyMemorial: true,
        manageFamily: true,
        viewHouseholdResponses: true,
      });
      assert.deepEqual(resolvePermissions({ personId: "p2", ...off }, h).can, {
        viewHousehold: false,
        applyMemorial: false,
        manageFamily: false,
        viewHouseholdResponses: false,
      });
      assert.equal(resolvePermissions({ personId: "p2", canViewHousehold: false, canApplyMemorial: true }, h).can.applyMemorial, true);
      assert.equal(resolvePermissions({ personId: "p2", canViewHousehold: false, canApplyMemorial: true }, h).can.viewHousehold, false);
      assert.equal(resolvePermissions({ personId: "p2", ...off }, { contactPersonId: null }).role, "family");
    });

    it("ポータルの操作者でない、食い違う操作者は拒否する", async () => {
      const staff = await staffOf(seed);
      await rejects(getPortalContext(staff), "forbidden");
      await rejects(getPortalFamilyTree(staff), "forbidden");
      // 健一さんのアカウントの ID に、山田さんの本人の ID を組み合わせた偽の操作者
      const forged = { ...kenichi, personId: ken.personId };
      await rejects(getPortalContext(forged), "forbidden");
      await rejects(getPortalFamilyTree(forged), "forbidden");
      await rejects(getPortalContext({ ...kenichi, channel: "web" }), "forbidden");
      await rejects(getPortalContext({ ...kenichi, portalAccountId: undefined }), "forbidden");
      await rejects(getPortalContext({ ...kenichi, templeId: "00000000-0000-0000-0000-000000000000" }), "forbidden");
      await rejects(
        getPortalContext(portalActor({ id: "00000000-0000-0000-0000-000000000000", templeId: kenichi.templeId, personId: kenichi.personId!, displayName: "x" })),
        "forbidden",
      );
    });
  });

  describe("家族の権限（初期値はどちらもオフ）", () => {
    it("権限のない家族は、家系図・法要の予定・申し込み・家族の権限の設定ができない。行事と施設の空きは使える", async () => {
      const misaki = await registerMisaki();
      const ctx = await getPortalContext(misaki);
      assert.equal(ctx.role, "family");
      assert.deepEqual(ctx.can, { viewHousehold: false, applyMemorial: false, manageFamily: false, viewHouseholdResponses: false });
      await rejects(getPortalFamilyTree(misaki), "forbidden", /窓口/);
      await rejects(getPortalMemorialSchedule(misaki, { today: TODAY }), "forbidden");
      await rejects(getMemorialApplyOptions(misaki, { today: TODAY }), "forbidden");
      await rejects(
        applyMemorial(misaki, { targets: [{ personId: seed.get("person:tanaka:wife"), kaiki: 3 }], preferredPeriods: [period], location: "temple" }, { today: TODAY }),
        "forbidden",
      );
      await rejects(listFamilyPermissions(misaki), "forbidden");
      await rejects(
        setFamilyPermissions(misaki, { portalAccountId: misaki.portalAccountId!, canViewHousehold: true, canApplyMemorial: true }),
        "forbidden",
      );
      assert.deepEqual(await listPortalMemorialRequests(misaki), []);
      assert.ok(Array.isArray(await listPortalEvents(misaki)));
      const av = await getPortalAvailability(misaki, { today: TODAY });
      assert.ok(av.facilities.length > 0);
      assert.equal((await listPortalEventResponses(misaki)).household, null);
    });

    it("can_view_household の家族（一郎さん）は、家系図と法要の予定を見られるが、申し込みと権限の設定はできない", async () => {
      const tree = await getPortalFamilyTree(ichiro);
      assert.equal(tree.householdName, "田中家");
      const schedule = await getPortalMemorialSchedule(ichiro, { today: TODAY });
      assert.ok(schedule.upcoming.length > 0);
      await rejects(getMemorialApplyOptions(ichiro, { today: TODAY }), "forbidden", /代理/);
      await rejects(listFamilyPermissions(ichiro), "forbidden");
      await rejects(
        setFamilyPermissions(ichiro, { portalAccountId: ichiro.portalAccountId!, canViewHousehold: true, canApplyMemorial: true }),
        "forbidden",
      );
    });

    it("窓口が家族に権限を与えると使えるようになり、外すと使えなくなる。監査ログに残る", async () => {
      const misaki = await registerMisaki();
      const list = await listFamilyPermissions(kenichi);
      assert.deepEqual(
        list.map((m) => m.name).sort(),
        ["田中 一郎", "田中 美咲", "田中 陽菜"].sort(),
        "窓口本人は一覧に出ない",
      );
      const m = list.find((x) => x.name === "田中 美咲")!;
      assert.deepEqual(m.account && { v: m.account.canViewHousehold, a: m.account.canApplyMemorial }, { v: false, a: false });
      assert.equal(list.find((x) => x.name === "田中 陽菜")!.account, null);

      await setFamilyPermissions(kenichi, { portalAccountId: misaki.portalAccountId!, canViewHousehold: false, canApplyMemorial: true });
      await getMemorialApplyOptions(misaki, { today: TODAY });
      await rejects(getPortalFamilyTree(misaki), "forbidden");
      await setFamilyPermissions(kenichi, { portalAccountId: misaki.portalAccountId!, canViewHousehold: true, canApplyMemorial: false });
      await getPortalFamilyTree(misaki);
      await rejects(getMemorialApplyOptions(misaki, { today: TODAY }), "forbidden");
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "portal.family_permission.set"));
      assert.equal(logs.length, 2);
      assert.equal(logs[0].channel, "portal");
    });

    it("窓口は、自分の権限と、ほかの家の方の権限は変えられない", async () => {
      await rejects(
        setFamilyPermissions(kenichi, { portalAccountId: kenichi.portalAccountId!, canViewHousehold: false, canApplyMemorial: false }),
        "invalid",
      );
      await rejects(
        setFamilyPermissions(kenichi, { portalAccountId: ken.portalAccountId!, canViewHousehold: true, canApplyMemorial: true }),
        "forbidden",
        /ほかの家/,
      );
      await rejects(
        setFamilyPermissions(ken, { portalAccountId: ichiro.portalAccountId!, canViewHousehold: false, canApplyMemorial: true }),
        "forbidden",
      );
      assert.deepEqual(await accountFlags(ichiro.portalAccountId!), { canViewHousehold: true, canApplyMemorial: false });
      await rejects(
        setFamilyPermissions(kenichi, { portalAccountId: "not-a-uuid", canViewHousehold: true, canApplyMemorial: true }),
        "not_found",
      );
    });

    it("代理で申し込める家族は、自分の申し込みだけを見られる（閲覧の権限がなければ、ほかの人の申し込みは見えない）", async () => {
      const misaki = await registerMisaki();
      await setFamilyPermissions(kenichi, { portalAccountId: misaki.portalAccountId!, canViewHousehold: false, canApplyMemorial: true });
      const wife = seed.get("person:tanaka:wife");
      const father = seed.get("person:tanaka:father");
      const byKenichi = await applyMemorial(kenichi, { targets: [{ personId: wife, kaiki: 3 }], preferredPeriods: [period], location: "temple" }, { today: TODAY });
      const byMisaki = await applyMemorial(misaki, { targets: [{ personId: father, kaiki: 19 }], preferredPeriods: [period], location: "home" }, { today: TODAY });
      const seenByMisaki = await listPortalMemorialRequests(misaki);
      assert.deepEqual(seenByMisaki.map((r) => r.id), [byMisaki.id]);
      assert.equal(seenByMisaki[0].mine, true);
      assert.equal(seenByMisaki[0].requestedByName, "田中 美咲");
      const seenByKenichi = await listPortalMemorialRequests(kenichi);
      assert.deepEqual(seenByKenichi.map((r) => r.id).sort(), [byKenichi.id, byMisaki.id].sort());
      const seenByIchiro = await listPortalMemorialRequests(ichiro);
      assert.equal(seenByIchiro.length, 2);
      assert.ok(seenByIchiro.every((r) => !r.mine));
    });
  });

  describe("他の家の情報は見られない", () => {
    it("家系図、法要の予定、申し込みの状況は、自分の世帯の分だけ", async () => {
      await applyMemorial(kenichi, { targets: [{ personId: seed.get("person:tanaka:wife"), kaiki: 3 }], preferredPeriods: [period], location: "temple" }, { today: TODAY });
      const tree = await getPortalFamilyTree(ken);
      const names = [...tree.generations.flatMap((g) => g.units.flatMap((u) => u.people)), ...tree.others].map((p) => p.name);
      assert.ok(names.includes("山田 太郎"));
      assert.ok(names.every((n) => n.startsWith("山田")), names.join(","));
      const schedule = await getPortalMemorialSchedule(ken, { today: TODAY });
      assert.ok(schedule.upcoming.every((u) => u.name.startsWith("山田")));
      assert.deepEqual(await listPortalMemorialRequests(ken), []);
      const opts = await getMemorialApplyOptions(ken, { today: TODAY });
      assert.ok(opts.deceased.every((d) => d.name.startsWith("山田")));
      assert.ok(opts.family.every((f) => f.name.startsWith("山田")));
    });

    it("ほかの家の故人や家族を指定した申し込みは拒否する（世帯は操作者の本人から決める）", async () => {
      await rejects(
        applyMemorial(ken, { targets: [{ personId: seed.get("person:tanaka:wife"), kaiki: 3 }], preferredPeriods: [period], location: "temple" }, { today: TODAY }),
        "invalid",
        /この家の過去帳/,
      );
      await rejects(
        applyMemorial(
          ken,
          { targets: [{ personId: seed.get("person:yamada:father"), kaiki: 7 }], seshuPersonId: seed.get("person:tanaka:son"), preferredPeriods: [period], location: "temple" },
          { today: TODAY },
        ),
        "invalid",
        /この家のご家族/,
      );
      assert.deepEqual(await listPortalMemorialRequests(kenichi), []);
    });

    it("行事の申し込みの確認は、本人の分と（窓口なら）自分の世帯の分だけ", async () => {
      const r = await listPortalEventResponses(ken);
      assert.ok(r.household);
      assert.ok(r.household.every((x) => x.formId));
      await rejects(getPortalEventForm(ken, "00000000-0000-0000-0000-000000000000"), "not_found");
    });
  });

  describe("窓口の交代", () => {
    it("窓口が交代すると、新しい窓口に権限が移り、家族に与えた権限は残る", async () => {
      const misaki = await registerMisaki();
      await setFamilyPermissions(kenichi, { portalAccountId: misaki.portalAccountId!, canViewHousehold: false, canApplyMemorial: true });
      const staff = await staffOf(seed);
      await setHouseholdRoles(staff, seed.get("household:tanaka"), { contactPersonId: seed.get("person:tanaka:head") });

      const i = await getPortalContext(ichiro);
      assert.equal(i.role, "contact");
      assert.equal(i.can.manageFamily, true);
      assert.equal(i.can.applyMemorial, true);
      const k = await getPortalContext(kenichi);
      assert.equal(k.role, "family");
      assert.deepEqual(k.can, { viewHousehold: false, applyMemorial: false, manageFamily: false, viewHouseholdResponses: false });
      await rejects(getPortalFamilyTree(kenichi), "forbidden");
      await rejects(listFamilyPermissions(kenichi), "forbidden");
      // 保存している権限は変わらない
      assert.deepEqual(await accountFlags(ichiro.portalAccountId!), { canViewHousehold: true, canApplyMemorial: false });
      assert.deepEqual(await accountFlags(misaki.portalAccountId!), { canViewHousehold: false, canApplyMemorial: true });
      assert.equal((await getPortalContext(misaki)).can.applyMemorial, true);
      // 新しい窓口が、前の窓口に権限を与えられる
      await setFamilyPermissions(ichiro, { portalAccountId: kenichi.portalAccountId!, canViewHousehold: true, canApplyMemorial: true });
      assert.equal((await getPortalContext(kenichi)).can.applyMemorial, true);
    });
  });

  describe("スタッフの代行設定", () => {
    it("窓口の意向の確認を入力して設定する。監査ログと台帳の対応記録に残る", async () => {
      const misaki = await registerMisaki();
      const staff = await staffOf(seed);
      const before = await db.select().from(contactLogs).where(eq(contactLogs.householdId, seed.get("household:tanaka")));
      await setFamilyPermissionsByStaff(staff, {
        portalAccountId: misaki.portalAccountId!,
        canViewHousehold: true,
        canApplyMemorial: true,
        confirmation: "窓口の健一さんに電話で確認",
      });
      assert.deepEqual(await accountFlags(misaki.portalAccountId!), { canViewHousehold: true, canApplyMemorial: true });
      const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "portal.family_permission.set_by_staff"));
      assert.equal(log.channel, "web");
      assert.match(log.summary ?? "", /田中 美咲さん.*健一さんに電話で確認/);
      const afterLogs = await db.select().from(contactLogs).where(eq(contactLogs.householdId, seed.get("household:tanaka")));
      assert.equal(afterLogs.length, before.length + 1);
      const added = afterLogs.find((l) => !before.some((b) => b.id === l.id))!;
      assert.equal(added.staffId, seed.get("staff:jushoku"));
      assert.match(added.body, /家族の権限を代わりに設定/);
    });

    it("確認の入力がない、窓口が対象、ポータルの操作者からは設定できない", async () => {
      const staff = await staffOf(seed);
      await rejects(
        setFamilyPermissionsByStaff(staff, { portalAccountId: ichiro.portalAccountId!, canViewHousehold: true, canApplyMemorial: true, confirmation: " " }),
        "invalid",
        /意向/,
      );
      await rejects(
        setFamilyPermissionsByStaff(staff, { portalAccountId: kenichi.portalAccountId!, canViewHousehold: true, canApplyMemorial: true, confirmation: "確認済み" }),
        "invalid",
        /窓口/,
      );
      await rejects(
        setFamilyPermissionsByStaff(kenichi, { portalAccountId: ichiro.portalAccountId!, canViewHousehold: true, canApplyMemorial: true, confirmation: "確認済み" }),
        "forbidden",
      );
      assert.deepEqual(await accountFlags(ichiro.portalAccountId!), { canViewHousehold: true, canApplyMemorial: false });
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "portal.family_permission.set_by_staff"));
      assert.equal(logs.length, 0);
    });

    it("管理画面の一覧はスタッフだけ。アカウントの窓口の印は台帳から決まる", async () => {
      const staff = await staffOf(seed);
      const accounts = await listPortalAccounts(staff);
      assert.equal(accounts.length, 3);
      assert.equal(accounts.find((a) => a.personName === "田中 健一")!.isContact, true);
      assert.equal(accounts.find((a) => a.personName === "田中 一郎")!.isContact, false);
      assert.equal(accounts.find((a) => a.personName === "田中 一郎")!.canViewHousehold, true);
      const invites = await listPortalInvites(staff, { status: "unused" });
      assert.equal(invites.length, 4);
      assert.ok(invites.every((i) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(i.displayCode)));
      assert.equal((await listPortalInvites(staff, { status: "expired" })).length, 1);
      assert.equal((await listPortalInvites(staff, { status: "used" })).length, 3);
      await rejects(listPortalAccounts(kenichi), "forbidden");
      await rejects(listPortalInvites(kenichi), "forbidden");
    });
  });

  describe("本人の状態", () => {
    it("本人が故人になったら、そのアカウントは使えない", async () => {
      const misaki = await registerMisaki();
      const staff = await staffOf(seed);
      await updatePerson(staff, seed.get("person:tanaka:son_wife"), {
        familyName: "田中",
        givenName: "美咲",
        birthDate: "1980-10-03",
        isDeceased: true,
        deathDate: "2026-11-01",
      });
      await rejects(getPortalContext(misaki), "forbidden");
    });
  });
});
