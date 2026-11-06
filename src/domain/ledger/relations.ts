// 個人どうしの関係（person_relations）と家系図
//
// 持ち方:
// - kind = "parent": related_person_id が person_id の親（子 → 親の向きに 1 行）
// - kind = "spouse": 配偶者どうしを 1 行だけ持つ（向きに意味はない。逆向きの行は作らない）
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { households, personRelations, persons } from "@/db/schema";
import { invalid, notFound, type Actor } from "@/domain/core";
import { assertStaff, fullName, isUuid, requirePersonRow, type RelationKind } from "./common";

export type RelationEntry = {
  id: string;
  kind: RelationKind;
  /** この人から見た相手の立場 */
  role: "parent" | "child" | "spouse";
  roleLabel: string;
  other: { id: string; name: string; householdId: string; isDeceased: boolean };
};

const ROLE_LABELS = { parent: "親", child: "子", spouse: "配偶者" } as const;

/** ある人の関係の一覧（親、子、配偶者） */
export async function listRelationsOf(personId: string, conn: DbOrTx = db): Promise<RelationEntry[]> {
  const other = alias(persons, "other");
  const rows = await conn
    .select({
      id: personRelations.id,
      kind: personRelations.kind,
      personId: personRelations.personId,
      relatedPersonId: personRelations.relatedPersonId,
      otherId: other.id,
      otherFamily: other.familyName,
      otherGiven: other.givenName,
      otherHousehold: other.householdId,
      otherDeceased: other.isDeceased,
    })
    .from(personRelations)
    .innerJoin(
      other,
      or(
        and(eq(personRelations.personId, personId), eq(other.id, personRelations.relatedPersonId)),
        and(eq(personRelations.relatedPersonId, personId), eq(other.id, personRelations.personId)),
      ),
    )
    .where(or(eq(personRelations.personId, personId), eq(personRelations.relatedPersonId, personId)))
    .orderBy(asc(personRelations.kind), asc(other.birthDate));
  return rows.map((r) => {
    const kind = r.kind as RelationKind;
    const role: RelationEntry["role"] =
      kind === "spouse" ? "spouse" : r.personId === personId ? "parent" : "child";
    return {
      id: r.id,
      kind,
      role,
      roleLabel: ROLE_LABELS[role],
      other: {
        id: r.otherId,
        name: `${r.otherFamily} ${r.otherGiven}`,
        householdId: r.otherHousehold,
        isDeceased: r.otherDeceased,
      },
    };
  });
}

/**
 * 関係を登録する。kind = "parent" のとき relatedPersonId が personId の親。
 * 配偶者は向きを問わず 1 組に 1 行だけ。親子の逆向き（お互いが親）は登録できない
 */
export async function addRelation(
  actor: Actor,
  input: { personId: string; relatedPersonId: string; kind: RelationKind | string },
  conn: DbOrTx = db,
): Promise<{ id: string }> {
  assertStaff(actor);
  if (input.kind !== "parent" && input.kind !== "spouse") throw invalid("関係は parent か spouse で指定してください");
  if (input.personId === input.relatedPersonId) throw invalid("同じ人どうしの関係は登録できません");
  await requirePersonRow(actor.templeId, input.personId, conn);
  await requirePersonRow(actor.templeId, input.relatedPersonId, conn);

  const existing = await conn
    .select()
    .from(personRelations)
    .where(
      or(
        and(eq(personRelations.personId, input.personId), eq(personRelations.relatedPersonId, input.relatedPersonId)),
        and(eq(personRelations.personId, input.relatedPersonId), eq(personRelations.relatedPersonId, input.personId)),
      ),
    );
  if (existing.length > 0) throw invalid("この 2 人の関係は、すでに登録されています");

  if (input.kind === "parent") {
    const parents = await conn
      .select({ id: personRelations.id })
      .from(personRelations)
      .where(and(eq(personRelations.personId, input.personId), eq(personRelations.kind, "parent")));
    if (parents.length >= 2) throw invalid("親はすでに 2 人登録されています");
  }

  const [row] = await conn
    .insert(personRelations)
    .values({
      templeId: actor.templeId,
      personId: input.personId,
      relatedPersonId: input.relatedPersonId,
      kind: input.kind,
    })
    .returning({ id: personRelations.id });
  return row;
}

/** 関係を消す（家系図の誤りを直すため。台帳の個人は消さない） */
export async function removeRelation(actor: Actor, relationId: string, conn: DbOrTx = db): Promise<void> {
  assertStaff(actor);
  if (!isUuid(relationId)) throw notFound("関係が見つかりません");
  const deleted = await conn
    .delete(personRelations)
    .where(and(eq(personRelations.id, relationId), eq(personRelations.templeId, actor.templeId)))
    .returning({ id: personRelations.id });
  if (deleted.length === 0) throw notFound("関係が見つかりません");
}

export type FamilyTreePerson = {
  id: string;
  householdId: string;
  /** この世帯の人か（関係でつながった、ほかの世帯の人は false） */
  inHousehold: boolean;
  familyName: string;
  givenName: string;
  name: string;
  kana: string | null;
  gender: string | null;
  relation: string | null;
  birthDate: string | null;
  isDeceased: boolean;
  deathDate: string | null;
  /** 法号 */
  homyo: string | null;
  isHead: boolean;
  isContact: boolean;
};

export type FamilyTreeRelation = {
  id: string;
  personId: string;
  relatedPersonId: string;
  /** parent: relatedPersonId が personId の親。spouse: 1 組に 1 行だけ（向きに意味はない） */
  kind: RelationKind;
};

export type FamilyTree = {
  householdId: string;
  persons: FamilyTreePerson[];
  relations: FamilyTreeRelation[];
};

/**
 * 家系図（06 のポータルで使う）。世帯の個人（故人を含む）と、その人たちの関係を返す。
 * 関係の相手がほかの世帯の人なら、その人も persons に入れる（inHousehold = false）。
 * 配偶者の関係は 1 組に 1 行だけなので、描くときは両方向として扱う。
 * 操作者を受け取らないので、呼ぶ側で権限を確かめてから使う
 */
export async function getFamilyTree(householdId: string, conn: DbOrTx = db): Promise<FamilyTree> {
  const [h] = await conn.select().from(households).where(eq(households.id, householdId));
  if (!h) return { householdId, persons: [], relations: [] };

  const members = await conn.select().from(persons).where(eq(persons.householdId, householdId));
  const memberIds = members.map((m) => m.id);
  if (memberIds.length === 0) return { householdId, persons: [], relations: [] };

  const rels = await conn
    .select()
    .from(personRelations)
    .where(or(inArray(personRelations.personId, memberIds), inArray(personRelations.relatedPersonId, memberIds)));

  const memberSet = new Set(memberIds);
  const outsideIds = [
    ...new Set(rels.flatMap((r) => [r.personId, r.relatedPersonId]).filter((id) => !memberSet.has(id))),
  ];
  const outsiders = outsideIds.length ? await conn.select().from(persons).where(inArray(persons.id, outsideIds)) : [];

  const toTree = (p: typeof persons.$inferSelect): FamilyTreePerson => ({
    id: p.id,
    householdId: p.householdId,
    inHousehold: p.householdId === householdId,
    familyName: p.familyName,
    givenName: p.givenName,
    name: fullName(p),
    kana: p.kana,
    gender: p.gender,
    relation: p.householdId === householdId ? p.relation : null,
    birthDate: p.birthDate,
    isDeceased: p.isDeceased,
    deathDate: p.deathDate,
    homyo: p.homyo,
    isHead: p.id === h.headPersonId,
    isContact: p.id === h.contactPersonId,
  });

  return {
    householdId,
    persons: [...members, ...outsiders]
      .sort((a, b) => (a.birthDate ?? "9999").localeCompare(b.birthDate ?? "9999"))
      .map(toTree),
    relations: rels.map((r) => ({
      id: r.id,
      personId: r.personId,
      relatedPersonId: r.relatedPersonId,
      kind: r.kind as RelationKind,
    })),
  };
}
