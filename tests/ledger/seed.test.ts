// シードが台本（spec.md §11、docs/tasks/01-ledger.md）の条件を満たしていることを確かめる。
// 04 法要の受付と 07 台本の通し確認が、このデータを前提にしている。
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { households, persons } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { getSectPreset, getStaffById, staffActor, type Actor } from "@/domain/core";
import {
  getFamilyTree,
  getHousehold,
  kaikiOfYear,
  listUpcomingMemorials,
  memorialInYear,
  searchDeceased,
  searchHouseholds,
  shoutsukiMeinichi,
} from "@/domain/ledger";
import { resetDb } from "../helpers/db";

const preset = getSectPreset("nichiren");
let seed: SeedContext;
let actor: Actor;

async function personRow(key: string) {
  const [p] = await db.select().from(persons).where(eq(persons.id, seed.get(key)));
  return p;
}

describe("台帳のシード（台本のデータ）", () => {
  before(async () => {
    seed = await resetDb();
    actor = staffActor((await getStaffById(seed.get("staff:jushoku")))!, "web");
  });
  after(async () => {
    await closeDb();
  });

  it("約 30 世帯、故人は約 50 人", async () => {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(households);
    const [{ d }] = await db
      .select({ d: sql<number>`count(*)::int` })
      .from(persons)
      .where(eq(persons.isDeceased, true));
    assert.ok(n >= 28 && n <= 32, `世帯 ${n}`);
    assert.ok(d >= 45 && d <= 55, `故人 ${d}`);
  });

  it("法号は「〇〇院日〇信士 / 信女」の形", async () => {
    const rows = await db.select().from(persons).where(eq(persons.isDeceased, true));
    for (const p of rows) assert.match(p.homyo ?? "", /^..院日.(信士|信女)$/, `${p.familyName}${p.givenName}`);
  });

  it("山田家: 父は 2021 年没で 2027 年が七回忌。祥月命日は 3/15 より後", async () => {
    const father = await personRow("person:yamada:father");
    assert.equal(father.deathDate?.slice(0, 4), "2021");
    assert.equal(kaikiOfYear(father.deathDate!, 2027), 7);
    assert.ok(shoutsukiMeinichi(father.deathDate!, 2027) > "2027-03-15");
  });

  it("山田家: 同じ世帯に、2027 年に別の年忌を迎える故人がいる（複数霊位供養）", async () => {
    const h = await getHousehold(actor, seed.get("household:yamada"), { today: "2026-11-06" });
    const others = h.deceased.filter(
      (d) => d.id !== seed.get("person:yamada:father") && memorialInYear(d.deathDate!, 2027, preset),
    );
    assert.ok(others.length >= 1);
  });

  it("山田家: 俗名が似た故人がほかの世帯にもいる（山田 + 父 で 2 世帯から候補が出る）", async () => {
    const list = await searchDeceased(actor, { name: "山田", relation: "父" });
    assert.ok(list.length >= 2);
    assert.ok(new Set(list.map((c) => c.household.id)).size >= 2);
    assert.ok(list.some((c) => c.personId === seed.get("person:yamada:father")));
  });

  it("田中家: 2025 年に亡くなった方が 2027 年に三回忌。窓口は世帯主と別。親子と配偶者の関係がある", async () => {
    const wife = await personRow("person:tanaka:wife");
    assert.equal(wife.deathDate?.slice(0, 4), "2025");
    assert.equal(memorialInYear(wife.deathDate!, 2027, preset)?.kaikiName, "三回忌");
    const h = await getHousehold(actor, seed.get("household:tanaka"));
    assert.equal(h.head?.id, seed.get("person:tanaka:head"));
    assert.equal(h.contact?.id, seed.get("person:tanaka:son"));
    const tree = await getFamilyTree(seed.get("household:tanaka"));
    assert.ok(tree.relations.some((r) => r.kind === "parent"));
    assert.ok(tree.relations.some((r) => r.kind === "spouse"));
  });

  it("「田中」で検索すると 1 世帯、「山田」では 2 世帯", async () => {
    assert.equal((await searchHouseholds(actor, "田中")).length, 1);
    assert.equal((await searchHouseholds(actor, "山田")).length, 2);
  });

  it("2026 年 12 月（撮影日から見た来月）に年忌を迎える故人が数人いる", async () => {
    const r = await listUpcomingMemorials(actor, { from: "2026-12-01", to: "2026-12-31" });
    assert.ok(r.total >= 3 && r.total <= 8, `${r.total} 人`);
  });
});
