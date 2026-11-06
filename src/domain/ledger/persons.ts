// 個人と故人（persons）: 作成、更新、取得、故人の検索
import { and, asc, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { households, persons } from "@/db/schema";
import { getTemple, invalid, isStaff, parseDateString, todayJst, type Actor } from "@/domain/core";
import {
  assertCanReadHousehold,
  assertStaff,
  compact,
  fullName,
  likeEscape,
  optDate,
  optGender,
  optText,
  portalHouseholdId,
  reqText,
  requireHouseholdRow,
  requirePersonRow,
  statusLabel,
  type HouseholdStatus,
} from "./common";
import { nextMemorial, type MemorialOccurrence } from "./kaiki";
import { listRelationsOf, type RelationEntry } from "./relations";

export type PersonInput = {
  familyName: string;
  givenName: string;
  kana?: string | null;
  gender?: string | null;
  /** 世帯主から見た続柄 */
  relation?: string | null;
  birthDate?: string | null;
  mobilePhone?: string | null;
  email?: string | null;
  isDeceased?: boolean;
  deathDate?: string | null;
  /** 法号 */
  homyo?: string | null;
  /** 享年（行年） */
  ageAtDeath?: number | null;
  notes?: string | null;
};

function personValues(input: PersonInput) {
  const isDeceased = Boolean(input.isDeceased);
  const birthDate = optDate(input.birthDate, "生年月日");
  const deathDate = optDate(input.deathDate, "没年月日");
  if (isDeceased && !deathDate) throw invalid("故人は没年月日を入力してください");
  if (birthDate && deathDate && deathDate < birthDate) throw invalid("没年月日が生年月日より前になっています");
  let ageAtDeath: number | null = null;
  if (input.ageAtDeath !== null && input.ageAtDeath !== undefined) {
    if (!Number.isInteger(input.ageAtDeath) || input.ageAtDeath < 0 || input.ageAtDeath > 130) {
      throw invalid("享年は 0〜130 の整数で入力してください");
    }
    ageAtDeath = input.ageAtDeath;
  }
  return {
    familyName: reqText(input.familyName, "姓", 30),
    givenName: reqText(input.givenName, "名", 30),
    kana: optText(input.kana, "カナ", 60),
    gender: optGender(input.gender),
    relation: optText(input.relation, "続柄", 20),
    birthDate,
    mobilePhone: optText(input.mobilePhone, "携帯番号", 30),
    email: optText(input.email, "メール", 200),
    isDeceased,
    deathDate: isDeceased ? deathDate : null,
    homyo: isDeceased ? optText(input.homyo, "法号", 60) : null,
    ageAtDeath: isDeceased ? ageAtDeath : null,
    notes: optText(input.notes, "備考", 2000),
  };
}

/**
 * 個人（生きている家族、または故人）を世帯に登録する。
 * 世帯に世帯主がいなければ、登録した生きている人を世帯主にする（窓口がいなければ窓口にもする）
 */
export async function createPerson(
  actor: Actor,
  input: PersonInput & { householdId: string },
  conn: DbOrTx = db,
): Promise<{ id: string }> {
  assertStaff(actor);
  const h = await requireHouseholdRow(actor.templeId, input.householdId, conn);
  const values = personValues(input);
  const [row] = await conn
    .insert(persons)
    .values({ templeId: actor.templeId, householdId: h.id, ...values })
    .returning({ id: persons.id });
  if (!values.isDeceased && !h.headPersonId) {
    await conn
      .update(households)
      .set({ headPersonId: row.id, contactPersonId: h.contactPersonId ?? row.id })
      .where(eq(households.id, h.id));
  }
  return row;
}

/** 個人の情報を更新する（世帯の移動はしない。所属の履歴はハッカソン後） */
export async function updatePerson(actor: Actor, id: string, input: PersonInput, conn: DbOrTx = db): Promise<void> {
  assertStaff(actor);
  const p = await requirePersonRow(actor.templeId, id, conn);
  const values = personValues(input);
  if (values.isDeceased && !p.isDeceased) {
    const h = await requireHouseholdRow(actor.templeId, p.householdId, conn);
    if (h.headPersonId === id || h.contactPersonId === id) {
      throw invalid("世帯主または窓口になっている人です。先に世帯主と窓口をほかの人に変えてから、故人にしてください");
    }
  }
  await conn.update(persons).set(values).where(eq(persons.id, id));
}

export type PersonDetail = {
  id: string;
  householdId: string;
  householdName: string;
  familyName: string;
  givenName: string;
  name: string;
  kana: string | null;
  gender: string | null;
  relation: string | null;
  birthDate: string | null;
  mobilePhone: string | null;
  email: string | null;
  isDeceased: boolean;
  deathDate: string | null;
  homyo: string | null;
  ageAtDeath: number | null;
  notes: string | null;
  isHead: boolean;
  isContact: boolean;
  relations: RelationEntry[];
};

/** 個人の詳細（関係を含む）。ポータルの操作者は自分の世帯の人だけ */
export async function getPerson(actor: Actor, id: string, conn: DbOrTx = db): Promise<PersonDetail> {
  const p = await requirePersonRow(actor.templeId, id, conn);
  await assertCanReadHousehold(actor, p.householdId, conn);
  const h = await requireHouseholdRow(actor.templeId, p.householdId, conn);
  return {
    id: p.id,
    householdId: p.householdId,
    householdName: h.name,
    familyName: p.familyName,
    givenName: p.givenName,
    name: fullName(p),
    kana: p.kana,
    gender: p.gender,
    relation: p.relation,
    birthDate: p.birthDate,
    mobilePhone: p.mobilePhone,
    email: p.email,
    isDeceased: p.isDeceased,
    deathDate: p.deathDate,
    homyo: p.homyo,
    ageAtDeath: p.ageAtDeath,
    notes: p.notes,
    isHead: h.headPersonId === p.id,
    isContact: h.contactPersonId === p.id,
    relations: await listRelationsOf(p.id, conn),
  };
}

export type DeceasedSearch = {
  /** 俗名（姓、名、カナ。部分一致。空白は無視） */
  name?: string;
  /** 法号（部分一致） */
  homyo?: string;
  householdId?: string;
  /** 続柄（世帯主から見た関係。部分一致。例: 「父」） */
  relation?: string;
  /** 俗名か法号のどちらかに当たればよい語（過去帳の画面の検索に使う） */
  query?: string;
  /** 世帯の状態。省略するとすべての状態 */
  status?: HouseholdStatus;
  limit?: number;
  /** 「次の年忌」の基準の日（"YYYY-MM-DD"。省略すると今日） */
  today?: string;
};

export type DeceasedCandidate = {
  personId: string;
  name: string;
  kana: string | null;
  gender: string | null;
  /** 法号 */
  homyo: string | null;
  deathDate: string | null;
  deathYear: number | null;
  /** 享年（行年） */
  ageAtDeath: number | null;
  relation: string | null;
  household: { id: string; name: string; address: string | null; status: HouseholdStatus; statusLabel: string };
  nextMemorial: MemorialOccurrence | null;
};

/**
 * 故人を検索する。候補を一覧で返し、1 人に絞らない（取り違えを防ぐため、法号と没年を並べて確認する）。
 * 条件をすべて省略すると、過去帳の全員を没年月日の新しい順に返す
 */
export async function searchDeceased(
  actor: Actor,
  filter: DeceasedSearch = {},
  conn: DbOrTx = db,
): Promise<DeceasedCandidate[]> {
  const conds: SQL[] = [eq(persons.templeId, actor.templeId), eq(persons.isDeceased, true)];
  let householdId = filter.householdId;
  if (!isStaff(actor)) {
    const own = await portalHouseholdId(actor, conn);
    if (householdId && householdId !== own) return [];
    householdId = own;
  }
  if (householdId) conds.push(eq(persons.householdId, householdId));
  if (filter.status) conds.push(eq(households.status, filter.status));

  const nameExpr = sql`replace(replace(${persons.familyName} || ${persons.givenName}, ' ', ''), '　', '')`;
  const kanaExpr = sql`replace(replace(coalesce(${persons.kana}, ''), ' ', ''), '　', '')`;
  const homyoExpr = sql`coalesce(${persons.homyo}, '')`;
  const like = (s: string) => `%${likeEscape(compact(s))}%`;

  if (filter.name && compact(filter.name)) {
    const l = like(filter.name);
    conds.push(or(sql`${nameExpr} ILIKE ${l}`, sql`${kanaExpr} ILIKE ${l}`)!);
  }
  if (filter.homyo && compact(filter.homyo)) conds.push(sql`${homyoExpr} ILIKE ${like(filter.homyo)}`);
  if (filter.relation && compact(filter.relation)) {
    conds.push(sql`coalesce(${persons.relation}, '') ILIKE ${like(filter.relation)}`);
  }
  if (filter.query && compact(filter.query)) {
    const l = like(filter.query);
    conds.push(or(sql`${nameExpr} ILIKE ${l}`, sql`${kanaExpr} ILIKE ${l}`, sql`${homyoExpr} ILIKE ${l}`)!);
  }

  const rows = await conn
    .select({ p: persons, h: households })
    .from(persons)
    .innerJoin(households, eq(households.id, persons.householdId))
    .where(and(...conds))
    .orderBy(desc(persons.deathDate), asc(persons.familyName), asc(persons.givenName))
    .limit(filter.limit ?? 200);

  const preset = (await getTemple(actor.templeId, conn)).preset;
  const today = filter.today ?? todayJst();
  return rows.map(({ p, h }) => ({
    personId: p.id,
    name: fullName(p),
    kana: p.kana,
    gender: p.gender,
    homyo: p.homyo,
    deathDate: p.deathDate,
    deathYear: p.deathDate ? parseDateString(p.deathDate).year : null,
    ageAtDeath: p.ageAtDeath,
    relation: p.relation,
    household: {
      id: h.id,
      name: h.name,
      address: h.address,
      status: h.status as HouseholdStatus,
      statusLabel: statusLabel(h.status),
    },
    nextMemorial: p.deathDate ? nextMemorial(p.deathDate, today, preset) : null,
  }));
}
