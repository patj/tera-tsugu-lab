// 家系図の並べ方（純粋な関数）と招待コードの部品
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FamilyTreePerson, FamilyTreeRelation } from "@/domain/ledger";
import { isInviteCodeShape, layoutFamilyTree, newInviteCode, normalizePortalEmail } from "@/domain/portal";

function person(id: string, birth: string, extra: Partial<FamilyTreePerson> = {}): FamilyTreePerson {
  return {
    id,
    householdId: "h",
    inHousehold: true,
    familyName: "田中",
    givenName: id,
    name: `田中 ${id}`,
    kana: null,
    gender: null,
    relation: null,
    birthDate: birth,
    isDeceased: false,
    deathDate: null,
    homyo: null,
    isHead: false,
    isContact: false,
    ...extra,
  };
}
const parent = (child: string, p: string): FamilyTreeRelation => ({ id: `${child}-${p}`, personId: child, relatedPersonId: p, kind: "parent" });
const spouse = (a: string, b: string): FamilyTreeRelation => ({ id: `${a}=${b}`, personId: a, relatedPersonId: b, kind: "spouse" });

describe("家系図の並べ方", () => {
  it("親子で世代を決め、配偶者を同じ段のまとまりにする。兄弟は生年月日の順、子は親の順に並ぶ", () => {
    const persons = [
      person("祖父", "1920-01-01"),
      person("祖母", "1922-01-01"),
      person("父", "1950-01-01", { isHead: true }),
      person("母", "1952-01-01"),
      person("叔父", "1955-01-01"),
      person("叔母", "1956-01-01"),
      person("長男", "1978-01-01"),
      person("長女", "1975-01-01"),
      person("いとこ", "1980-01-01"),
    ];
    const relations = [
      spouse("祖父", "祖母"),
      parent("父", "祖父"),
      parent("父", "祖母"),
      parent("叔父", "祖父"),
      spouse("母", "父"),
      spouse("叔父", "叔母"),
      parent("長男", "父"),
      parent("長男", "母"),
      parent("長女", "父"),
      parent("長女", "母"),
      parent("いとこ", "叔父"),
    ];
    const layout = layoutFamilyTree({ persons, relations });
    const rows = layout.generations.map((g) => g.units.map((u) => u.people.map((p) => p.name.replace("田中 ", "")).join("=")));
    assert.deepEqual(rows, [["祖父=祖母"], ["父=母", "叔父=叔母"], ["長女", "長男", "いとこ"]]);
    assert.deepEqual(layout.generations.map((g) => g.index), [0, 1, 2]);
    assert.deepEqual(layout.others, []);
    const chonan = layout.generations[2].units[1].people[0];
    assert.deepEqual(chonan.parentNames, ["父", "母"]);
  });

  it("関係でつながっていない人は「そのほかのご家族」に入る。人がいなければ空", () => {
    const layout = layoutFamilyTree({
      persons: [person("本人", "1960-01-01", { isHead: true }), person("同居人", "1970-01-01")],
      relations: [],
    });
    assert.equal(layout.generations.length, 1);
    assert.deepEqual(layout.others.map((p) => p.name), ["田中 同居人"]);
    assert.deepEqual(layoutFamilyTree({ persons: [], relations: [] }), { generations: [], others: [] });
  });

  it("家系図にいない人との関係は無視する", () => {
    const layout = layoutFamilyTree({
      persons: [person("本人", "1960-01-01", { isHead: true })],
      relations: [parent("本人", "外の人"), spouse("本人", "外の配偶者")],
    });
    assert.equal(layout.generations.length, 1);
    assert.deepEqual(layout.generations[0].units[0].people[0].parentNames, []);
  });
});

describe("招待コードとメールアドレスの部品", () => {
  it("招待コードは 8 文字で、まぎらわしい文字（0 O 1 I L）を使わない", () => {
    for (let i = 0; i < 200; i++) {
      const c = newInviteCode();
      assert.ok(isInviteCodeShape(c), c);
      assert.ok(!/[01OIL]/.test(c), c);
    }
    assert.equal(isInviteCodeShape("ABCD0FGH"), false);
    assert.equal(isInviteCodeShape("ABCDEFG"), false);
  });

  it("メールアドレスは小文字にそろえ、形の正しくないものは null", () => {
    assert.equal(normalizePortalEmail(" Ken.Yamada@Example.COM "), "ken.yamada@example.com");
    assert.equal(normalizePortalEmail("ken@example"), null);
    assert.equal(normalizePortalEmail("a b@example.com"), null);
  });
});
