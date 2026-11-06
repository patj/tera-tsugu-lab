// 家系図の並べ方（DB を使わない純粋な関数）。ライブラリを使わず、世代ごとの段に並べる
// - 親子の関係で世代を決める（親は子の 1 つ上の段、配偶者は同じ段）
// - 同じ段では、配偶者どうしを 1 つのまとまり（夫婦）にし、親のまとまりの順に並べる（同じ親の子は生年月日の順）
// - 世帯主とつながっていない人は、最後の「そのほかのご家族」に並べる
import type { FamilyTree, FamilyTreePerson } from "@/domain/ledger";

export type TreePersonView = {
  id: string;
  name: string;
  /** 世帯主から見た続柄 */
  relation: string | null;
  isDeceased: boolean;
  /** 没年月日（"YYYY-MM-DD"） */
  deathDate: string | null;
  /** 法号 */
  homyo: string | null;
  isHead: boolean;
  isContact: boolean;
  /** 家系図にいる親の名前（「一郎・和子の子」の表示に使う） */
  parentNames: string[];
};

export type TreeUnit = { people: TreePersonView[] };
export type TreeGeneration = { index: number; units: TreeUnit[] };
export type TreeLayout = { generations: TreeGeneration[]; others: TreePersonView[] };

/** 世帯の人だけで、世代ごとの段を作る（ほかの世帯の人は、呼ぶ側で除いておく） */
export function layoutFamilyTree(tree: Pick<FamilyTree, "persons" | "relations">): TreeLayout {
  const people = tree.persons;
  const byId = new Map(people.map((p) => [p.id, p]));
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);
  for (const r of tree.relations) {
    if (!byId.has(r.personId) || !byId.has(r.relatedPersonId)) continue;
    if (r.kind === "parent") {
      push(parentsOf, r.personId, r.relatedPersonId);
      push(childrenOf, r.relatedPersonId, r.personId);
    } else {
      push(spousesOf, r.personId, r.relatedPersonId);
      push(spousesOf, r.relatedPersonId, r.personId);
    }
  }

  // 世帯主（いなければ最初の人）から、関係をたどって世代を決める
  const root = people.find((p) => p.isHead) ?? people[0];
  const gen = new Map<string, number>();
  if (root) {
    gen.set(root.id, 0);
    const queue = [root.id];
    while (queue.length) {
      const id = queue.shift()!;
      const g = gen.get(id)!;
      const next: [string, number][] = [
        ...(parentsOf.get(id) ?? []).map((x) => [x, g - 1] as [string, number]),
        ...(childrenOf.get(id) ?? []).map((x) => [x, g + 1] as [string, number]),
        ...(spousesOf.get(id) ?? []).map((x) => [x, g] as [string, number]),
      ];
      for (const [x, gx] of next) {
        if (gen.has(x)) continue;
        gen.set(x, gx);
        queue.push(x);
      }
    }
  }

  const view = (p: FamilyTreePerson): TreePersonView => ({
    id: p.id,
    name: p.name,
    relation: p.relation,
    isDeceased: p.isDeceased,
    deathDate: p.deathDate,
    homyo: p.homyo,
    isHead: p.isHead,
    isContact: p.isContact,
    parentNames: (parentsOf.get(p.id) ?? [])
      .map((x) => byId.get(x)!)
      .sort(byBirth)
      .map((x) => x.givenName),
  });

  const min = Math.min(...gen.values());
  const levels = [...new Set(gen.values())].sort((a, b) => a - b);
  const generations: TreeGeneration[] = [];
  /** 前の段のまとまりの順番（人の ID → 何番目のまとまりか） */
  let unitOrder = new Map<string, number>();
  for (const level of levels) {
    const ids = people.filter((p) => gen.get(p.id) === level).map((p) => p.id);
    // 配偶者どうしをまとめる（同じ段の人だけ）
    const seen = new Set<string>();
    const units: FamilyTreePerson[][] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const unit: string[] = [];
      const stack = [id];
      while (stack.length) {
        const x = stack.pop()!;
        if (seen.has(x)) continue;
        seen.add(x);
        unit.push(x);
        for (const s of spousesOf.get(x) ?? []) if (gen.get(s) === level && !seen.has(s)) stack.push(s);
      }
      // 夫婦の中は、血縁（親が家系図にいる人）、世帯主、夫（家系図の慣習）を先に、次に生年月日の順
      units.push(
        unit
          .map((x) => byId.get(x)!)
          .sort(
            (a, b) =>
              Number(parentsOf.has(b.id)) - Number(parentsOf.has(a.id)) ||
              Number(b.isHead) - Number(a.isHead) ||
              Number(b.gender === "male") - Number(a.gender === "male") ||
              byBirth(a, b),
          ),
      );
    }
    const parentRank = (u: FamilyTreePerson[]) =>
      Math.min(...u.flatMap((p) => (parentsOf.get(p.id) ?? []).map((x) => unitOrder.get(x) ?? Infinity)), Infinity);
    units.sort((a, b) => parentRank(a) - parentRank(b) || byBirth(earliest(a), earliest(b)));
    unitOrder = new Map(units.flatMap((u, i) => u.map((p) => [p.id, i] as [string, number])));
    generations.push({ index: level - min, units: units.map((u) => ({ people: u.map(view) })) });
  }

  const others = people.filter((p) => !gen.has(p.id)).sort(byBirth).map(view);
  return { generations, others };
}

function byBirth(a: FamilyTreePerson, b: FamilyTreePerson): number {
  return (a.birthDate ?? "9999").localeCompare(b.birthDate ?? "9999");
}

function earliest(u: FamilyTreePerson[]): FamilyTreePerson {
  return [...u].sort(byBirth)[0];
}
