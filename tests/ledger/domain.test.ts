import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { households } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { DomainError, getStaffById, portalActor, staffActor, systemActor, type Actor } from "@/domain/core";
import {
  addContactLog,
  addRelation,
  createContact,
  createHousehold,
  createPerson,
  getFamilyTree,
  getHousehold,
  getHouseholdBasics,
  getHouseholdMembers,
  getPerson,
  listUpcomingMemorials,
  removeRelation,
  searchDeceased,
  searchHouseholds,
  setHouseholdRoles,
  updateHousehold,
  updatePerson,
} from "@/domain/ledger";
import { resetDb } from "../helpers/db";

let seed: SeedContext;
let staff: Actor;
let tanakaPortal: Actor;

const rejects = (p: Promise<unknown>, code: string, re?: RegExp) =>
  assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DomainError, String(e));
    assert.equal(e.code, code);
    if (re) assert.match(e.message, re);
    return true;
  });

describe("台帳のドメイン層", () => {
  beforeEach(async () => {
    seed = await resetDb();
    staff = staffActor((await getStaffById(seed.get("staff:jimuin")))!, "web");
    tanakaPortal = portalActor({
      id: "00000000-0000-0000-0000-000000000001",
      templeId: seed.templeId,
      personId: seed.get("person:tanaka:son"),
      displayName: "田中 健一",
    });
  });
  after(async () => {
    await closeDb();
  });

  describe("検索", () => {
    it("世帯を名前、住所、電話（ハイフンなし）、家族の氏名で探せる", async () => {
      const id = seed.get("household:tanaka");
      for (const q of ["田中", "たなか", "栄町", "0422550303", "0422-55-0303", "健一", "田中健一", "けんいち"]) {
        const r = await searchHouseholds(staff, q);
        assert.ok(r.some((h) => h.id === id), q);
      }
      const t = (await searchHouseholds(staff, "田中"))[0];
      assert.equal(t.head?.name, "田中 一郎");
      assert.equal(t.contact?.name, "田中 健一");
    });

    it("状態で絞り込める", async () => {
      const all = await searchHouseholds(staff, "");
      const active = await searchHouseholds(staff, "", { status: "active" });
      const left = await searchHouseholds(staff, "", { status: "left" });
      assert.equal(all.length, 30);
      assert.deepEqual(left.map((h) => h.name), ["加藤家"]);
      assert.equal(active.length, 28);
    });

    it("故人を法号、世帯、続柄で探せる。候補は 1 人に絞らない", async () => {
      const byHomyo = await searchDeceased(staff, { homyo: "慈光院" });
      assert.deepEqual(byHomyo.map((c) => c.name), ["山田 太郎"]);
      const yamada = await searchDeceased(staff, { householdId: seed.get("household:yamada") });
      assert.equal(yamada.length, 3);
      assert.deepEqual(yamada.map((c) => c.deathYear), [2021, 2015, 1990]);
      const taro = await searchDeceased(staff, { name: "山田 太" });
      assert.deepEqual(taro.map((c) => c.name).sort(), ["山田 太一", "山田 太郎"]);
    });

    it("世帯の詳細: 世帯主を先頭にした家族、故人と次の年忌、対応記録", async () => {
      const h = await getHousehold(staff, seed.get("household:yamada"), { today: "2026-11-06" });
      assert.equal(h.members[0].name, "山田 健");
      assert.equal(h.members[0].isHead, true);
      assert.equal(h.members[0].isContact, true);
      assert.equal(h.members.length, 5);
      const father = h.deceased.find((d) => d.name === "山田 太郎")!;
      assert.equal(father.homyo, "慈光院日太信士");
      assert.equal(father.ageAtDeath, 82);
      assert.equal(father.nextMemorial?.kaikiName, "七回忌");
      assert.equal(father.nextMemorial?.meinichi, "2027-03-24");
      assert.equal(h.contactLogs.length, 1);
    });

    it("getHouseholdMembers は生きている家族だけ（カナ、生年月日、性別つき）", async () => {
      const m = await getHouseholdMembers(seed.get("household:tanaka"));
      assert.deepEqual(m.map((x) => x.name), ["田中 一郎", "田中 健一", "田中 美咲", "田中 陽菜"]);
      assert.equal(m[1].kana, "たなか けんいち");
      assert.equal(m[1].birthDate, "1978-05-20");
      assert.equal(m[1].gender, "male");
      assert.equal(m[1].isContact, true);
      const b = await getHouseholdBasics(seed.get("household:tanaka"));
      assert.equal(b?.address, "東京都武蔵野市栄町 1-4-12");
      assert.equal(b?.contactPersonId, seed.get("person:tanaka:son"));
    });

    it("家系図: 個人（故人を含む）と関係。配偶者は 1 組に 1 行", async () => {
      const tree = await getFamilyTree(seed.get("household:tanaka"));
      assert.equal(tree.persons.length, 7);
      const kazuko = seed.get("person:tanaka:wife");
      const ichiro = seed.get("person:tanaka:head");
      const spouse = tree.relations.filter(
        (r) => r.kind === "spouse" && [r.personId, r.relatedPersonId].includes(kazuko),
      );
      assert.equal(spouse.length, 1);
      assert.ok(
        tree.relations.some(
          (r) => r.kind === "parent" && r.personId === seed.get("person:tanaka:son") && r.relatedPersonId === ichiro,
        ),
      );
    });
  });

  describe("ポータルの操作者", () => {
    it("自分の世帯は見られるが、対応記録は返らない。ほかの世帯は見られない", async () => {
      const h = await getHousehold(tanakaPortal, seed.get("household:tanaka"));
      assert.equal(h.name, "田中家");
      assert.deepEqual(h.contactLogs, []);
      await rejects(getHousehold(tanakaPortal, seed.get("household:yamada")), "forbidden");
      await rejects(searchHouseholds(tanakaPortal, "田中"), "forbidden");
    });

    it("故人の検索は自分の世帯に限られる", async () => {
      const list = await searchDeceased(tanakaPortal, { name: "山田" });
      assert.deepEqual(list, []);
      const own = await searchDeceased(tanakaPortal, {});
      assert.ok(own.every((c) => c.household.id === seed.get("household:tanaka")));
      assert.equal(own.length, 3);
    });

    it("台帳の編集はできない", async () => {
      await rejects(
        updateHousehold(tanakaPortal, seed.get("household:tanaka"), { name: "田中家" }),
        "forbidden",
      );
    });
  });

  describe("作成と更新", () => {
    it("世帯を作り、最初に登録した生きている人が世帯主と窓口になる", async () => {
      const { id } = await createHousehold(staff, { name: "新井家", kana: "あらい", address: "東京都武蔵野市中町 1-1" });
      const dead = await createPerson(staff, {
        householdId: id,
        familyName: "新井",
        givenName: "一",
        isDeceased: true,
        deathDate: "2020-05-05",
        homyo: "新光院日一信士",
      });
      let h = await getHousehold(staff, id);
      assert.equal(h.head, null);
      const head = await createPerson(staff, { householdId: id, familyName: "新井", givenName: "二郎", relation: "本人" });
      const wife = await createPerson(staff, { householdId: id, familyName: "新井", givenName: "花子", relation: "妻" });
      h = await getHousehold(staff, id);
      assert.equal(h.head?.id, head.id);
      assert.equal(h.contact?.id, head.id);
      assert.equal(h.deceased[0].id, dead.id);

      // 窓口を妻に変える
      await setHouseholdRoles(staff, id, { contactPersonId: wife.id });
      h = await getHousehold(staff, id);
      assert.equal(h.head?.id, head.id);
      assert.equal(h.contact?.id, wife.id);

      // 故人やほかの世帯の人は、世帯主や窓口にできない
      await rejects(setHouseholdRoles(staff, id, { headPersonId: dead.id }), "invalid", /故人/);
      await rejects(
        setHouseholdRoles(staff, id, { contactPersonId: seed.get("person:yamada:head") }),
        "invalid",
        /この世帯の人/,
      );
      // 窓口の人は、先に窓口を変えないと故人にできない
      await rejects(
        updatePerson(staff, wife.id, { familyName: "新井", givenName: "花子", isDeceased: true, deathDate: "2026-01-01" }),
        "invalid",
        /世帯主または窓口/,
      );
    });

    it("離檀・転出は状態で表す（物理削除はしない）", async () => {
      const id = seed.get("household:ito");
      const before = await getHousehold(staff, id);
      await updateHousehold(staff, id, { name: before.name, kana: before.kana, address: before.address, status: "moved" });
      const after = await getHousehold(staff, id);
      assert.equal(after.status, "moved");
      assert.equal(after.statusLabel, "転出");
      assert.equal(after.deceased.length, 1);
    });

    it("入力の検証: 故人は没年月日が必須。日付の形。存在しない世帯", async () => {
      const hid = seed.get("household:ito");
      await rejects(createPerson(staff, { householdId: hid, familyName: "伊藤", givenName: "x", isDeceased: true }), "invalid", /没年月日/);
      await rejects(createPerson(staff, { householdId: hid, familyName: "伊藤", givenName: "x", birthDate: "2020/01/01" }), "invalid", /生年月日/);
      await rejects(createPerson(staff, { householdId: hid, familyName: "", givenName: "x" }), "invalid", /姓/);
      await rejects(getHousehold(staff, "nope"), "not_found");
      await rejects(updateHousehold(staff, hid, { name: "伊藤家", status: "gone" }), "invalid");
    });

    it("関係: 親と配偶者を登録・削除できる。重複と逆向きは断る", async () => {
      const head = seed.get("person:ito:head");
      const wife = seed.get("person:ito:wife");
      const father = seed.get("person:ito:father");
      // 伊藤家のシードには 直樹 → 勝（親）と、直樹 ― 裕子（配偶者）がある
      await rejects(addRelation(staff, { personId: wife, relatedPersonId: head, kind: "spouse" }), "invalid", /すでに/);
      await rejects(addRelation(staff, { personId: father, relatedPersonId: head, kind: "parent" }), "invalid", /すでに/);
      await rejects(addRelation(staff, { personId: head, relatedPersonId: head, kind: "parent" }), "invalid");
      const p = await getPerson(staff, head);
      assert.deepEqual(p.relations.map((r) => `${r.roleLabel}:${r.other.name}`).sort(), ["親:伊藤 勝", "配偶者:伊藤 裕子"]);

      const child = await createPerson(staff, { householdId: seed.get("household:ito"), familyName: "伊藤", givenName: "蓮", relation: "長男" });
      const rel = await addRelation(staff, { personId: child.id, relatedPersonId: head, kind: "parent" });
      assert.ok((await getPerson(staff, head)).relations.some((r) => r.role === "child" && r.other.id === child.id));
      await removeRelation(staff, rel.id);
      assert.ok(!(await getPerson(staff, head)).relations.some((r) => r.other.id === child.id));
      await rejects(removeRelation(staff, rel.id), "not_found");
    });
  });

  describe("年忌を迎える故人の一覧", () => {
    it("期間が年をまたぐ場合（2026-12-15〜2027-01-10）", async () => {
      const r = await listUpcomingMemorials(staff, { from: "2026-12-15", to: "2027-01-10" });
      const names = r.groups.flatMap((g) => g.items.map((i) => `${i.name}:${i.kaikiName}:${i.meinichi}`));
      assert.deepEqual(names.sort(), [
        "伊藤 勝:十三回忌:2026-12-20",
        "佐藤 キミ:三回忌:2026-12-28",
        "佐藤 茂:七回忌:2026-12-18",
        "小林 フミ:十三回忌:2027-01-03",
      ]);
      // 回忌の小さい順。同じ回忌は祥月命日の順
      assert.deepEqual(r.groups.map((g) => g.kaiki), [3, 7, 13]);
      assert.deepEqual(r.groups[2].items.map((i) => i.meinichi), ["2026-12-20", "2027-01-03"]);
    });

    it("同じ世帯に複数いる場合は、それぞれに出て、互いを複数霊位供養の候補として示す", async () => {
      const r = await listUpcomingMemorials(staff, { from: "2026-12-01", to: "2026-12-31" });
      const sato = r.groups.flatMap((g) => g.items).filter((i) => i.household.name === "佐藤家");
      assert.equal(sato.length, 2);
      for (const i of sato) assert.equal(i.sameYearInHousehold.length, 1);
      // 山田家は 2027 年の七回忌（3 月）と十三回忌（8 月）が同じ年
      const y = await listUpcomingMemorials(staff, { from: "2027-03-01", to: "2027-03-31" });
      const taro = y.groups.flatMap((g) => g.items).find((i) => i.name === "山田 太郎")!;
      assert.deepEqual(taro.sameYearInHousehold.map((o) => `${o.name}:${o.kaikiName}`), ["山田 キヨ:十三回忌"]);
    });

    it("2/29 に亡くなった方は、うるう年でない年は 2/28 に数える", async () => {
      const hid = seed.get("household:ito");
      await createPerson(staff, { householdId: hid, familyName: "伊藤", givenName: "閏", isDeceased: true, deathDate: "2024-02-29" });
      const r = await listUpcomingMemorials(staff, { from: "2025-02-28", to: "2025-02-28" });
      assert.deepEqual(r.groups.flatMap((g) => g.items.map((i) => `${i.name}:${i.kaikiName}`)), ["伊藤 閏:一周忌"]);
    });

    it("離檀した世帯は含めない", async () => {
      await db.update(households).set({ status: "active" }).where(eq(households.id, seed.get("household:kato")));
      const r = await listUpcomingMemorials(staff, { from: "2026-12-01", to: "2026-12-31" });
      assert.ok(r.groups.flatMap((g) => g.items).some((i) => i.name === "加藤 正"));
      await db.update(households).set({ status: "left" }).where(eq(households.id, seed.get("household:kato")));
      const r2 = await listUpcomingMemorials(staff, { from: "2026-12-01", to: "2026-12-31" });
      assert.ok(!r2.groups.flatMap((g) => g.items).some((i) => i.name === "加藤 正"));
    });
  });

  describe("対応記録と一般コンタクト", () => {
    it("addContactLog は tx を省略しても、渡しても使える。記録者は操作者", async () => {
      const hid = seed.get("household:tanaka");
      const a = await addContactLog(staff, { householdId: hid, kind: "電話", body: "法要の相談" });
      assert.equal(a.staffName, "鈴木 恵");
      const b = await db.transaction((tx) => addContactLog(staff, tx, { householdId: hid, kind: "案内", body: "案内状を送付" }));
      const c = await addContactLog(staff, undefined, { householdId: hid, kind: "その他", body: "メモ" });
      const h = await getHousehold(staff, hid);
      assert.deepEqual(
        h.contactLogs.slice(0, 3).map((l) => l.id).sort(),
        [a.id, b.id, c.id].sort(),
      );
      await rejects(addContactLog(staff, { householdId: hid, kind: "案内", body: "  " }), "invalid");
    });

    it("トランザクションが失敗したら対応記録も残らない", async () => {
      const hid = seed.get("household:tanaka");
      const before = (await getHousehold(staff, hid)).contactLogs.length;
      await assert.rejects(
        db.transaction(async (tx) => {
          await addContactLog(staff, tx, { householdId: hid, kind: "案内", body: "取り消される" });
          throw new Error("rollback");
        }),
      );
      assert.equal((await getHousehold(staff, hid)).contactLogs.length, before);
    });

    it("createContact は電話かメールが必須。公開ページからは systemActor で呼べる", async () => {
      const c = await createContact(systemActor(seed.templeId), { name: "外部 太郎", phone: "080-0000-0000" });
      assert.equal(c.name, "外部 太郎");
      const d = await db.transaction((tx) => createContact(systemActor(seed.templeId), tx, { name: "外部 花子", email: "h@example.com" }));
      assert.equal(d.email, "h@example.com");
      await rejects(createContact(systemActor(seed.templeId), { name: "連絡先なし" }), "invalid", /電話かメール/);
      await rejects(createContact(systemActor(seed.templeId), { name: "x", email: "bad" }), "invalid", /メール/);
    });
  });
});
