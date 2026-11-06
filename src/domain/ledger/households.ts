// 世帯（households）: 検索、詳細、作成、更新、世帯主と窓口
import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { contactLogs, households, persons, staff } from "@/db/schema";
import { getTemple, invalid, isStaff, todayJst, type Actor } from "@/domain/core";
import {
  assertCanReadHousehold,
  assertStaff,
  compact,
  fullName,
  likeEscape,
  optDate,
  optText,
  reqStatus,
  reqText,
  requireHouseholdRow,
  statusLabel,
  type HouseholdStatus,
} from "./common";
import { nextMemorial, type MemorialOccurrence } from "./kaiki";

export type HouseholdSummary = {
  id: string;
  name: string;
  kana: string | null;
  address: string | null;
  phone: string | null;
  status: HouseholdStatus;
  statusLabel: string;
  head: { id: string; name: string } | null;
  contact: { id: string; name: string } | null;
};

export type HouseholdMemberEntry = {
  id: string;
  familyName: string;
  givenName: string;
  name: string;
  kana: string | null;
  gender: string | null;
  relation: string | null;
  birthDate: string | null;
  mobilePhone: string | null;
  email: string | null;
  isHead: boolean;
  isContact: boolean;
};

export type DeceasedEntry = {
  id: string;
  name: string;
  kana: string | null;
  gender: string | null;
  relation: string | null;
  /** 法号 */
  homyo: string | null;
  deathDate: string | null;
  /** 享年（行年） */
  ageAtDeath: number | null;
  notes: string | null;
  /** 次の年忌（祥月命日が今日以降の、いちばん近いもの） */
  nextMemorial: MemorialOccurrence | null;
};

export type ContactLogEntry = {
  id: string;
  householdId: string;
  kind: string;
  body: string;
  staffName: string | null;
  createdAt: Date;
};

export type HouseholdDetail = HouseholdSummary & {
  postalCode: string | null;
  joinedOn: string | null;
  notes: string | null;
  /** 生きている家族 */
  members: HouseholdMemberEntry[];
  /** 故人（没年月日の新しい順） */
  deceased: DeceasedEntry[];
  /** 直近の対応記録（新しい順。ポータルの操作者には返さない） */
  contactLogs: ContactLogEntry[];
};

const head = alias(persons, "head");
const contact = alias(persons, "contact_person");

function summarySelect() {
  return {
    id: households.id,
    name: households.name,
    kana: households.kana,
    address: households.address,
    phone: households.phone,
    status: households.status,
    headId: head.id,
    headFamily: head.familyName,
    headGiven: head.givenName,
    contactId: contact.id,
    contactFamily: contact.familyName,
    contactGiven: contact.givenName,
  };
}

type SummaryRow = {
  id: string;
  name: string;
  kana: string | null;
  address: string | null;
  phone: string | null;
  status: string;
  headId: string | null;
  headFamily: string | null;
  headGiven: string | null;
  contactId: string | null;
  contactFamily: string | null;
  contactGiven: string | null;
};

function toSummary(r: SummaryRow): HouseholdSummary {
  return {
    id: r.id,
    name: r.name,
    kana: r.kana,
    address: r.address,
    phone: r.phone,
    status: r.status as HouseholdStatus,
    statusLabel: statusLabel(r.status),
    head: r.headId ? { id: r.headId, name: `${r.headFamily} ${r.headGiven}` } : null,
    contact: r.contactId ? { id: r.contactId, name: `${r.contactFamily} ${r.contactGiven}` } : null,
  };
}

export type SearchHouseholdsOptions = {
  /** 状態で絞り込む。省略するとすべての状態 */
  status?: HouseholdStatus;
  limit?: number;
};

/**
 * 世帯を検索する。世帯の名前とカナ、家族の氏名とカナ、住所、電話（固定電話と家族の携帯。ハイフンは無視）に当たる世帯を返す。
 * query が空なら、すべての世帯をカナの順に返す
 */
export async function searchHouseholds(
  actor: Actor,
  query: string,
  opts: SearchHouseholdsOptions = {},
  conn: DbOrTx = db,
): Promise<HouseholdSummary[]> {
  assertStaff(actor);
  const conds: SQL[] = [eq(households.templeId, actor.templeId)];
  if (opts.status) conds.push(eq(households.status, opts.status));

  const q = compact(query ?? "");
  if (q) {
    const like = `%${likeEscape(q)}%`;
    const digits = q.replace(/[^0-9]/g, "");
    const nameOf = (col: SQL) => sql`replace(replace(${col}, ' ', ''), '　', '')`;
    const personMatch: SQL[] = [
      sql`${nameOf(sql`${persons.familyName} || ${persons.givenName}`)} ILIKE ${like}`,
      sql`${nameOf(sql`coalesce(${persons.kana}, '')`)} ILIKE ${like}`,
    ];
    const householdMatch: SQL[] = [
      sql`${nameOf(sql`${households.name}`)} ILIKE ${like}`,
      sql`${nameOf(sql`coalesce(${households.kana}, '')`)} ILIKE ${like}`,
      sql`${nameOf(sql`coalesce(${households.address}, '')`)} ILIKE ${like}`,
    ];
    if (digits.length >= 3) {
      const dlike = `%${digits}%`;
      householdMatch.push(sql`regexp_replace(coalesce(${households.phone}, ''), '[^0-9]', '', 'g') LIKE ${dlike}`);
      personMatch.push(sql`regexp_replace(coalesce(${persons.mobilePhone}, ''), '[^0-9]', '', 'g') LIKE ${dlike}`);
    }
    conds.push(
      or(
        ...householdMatch,
        sql`EXISTS (SELECT 1 FROM ${persons} WHERE ${persons.householdId} = ${households.id} AND (${or(...personMatch)}))`,
      )!,
    );
  }

  const rows = await conn
    .select(summarySelect())
    .from(households)
    .leftJoin(head, eq(head.id, households.headPersonId))
    .leftJoin(contact, eq(contact.id, households.contactPersonId))
    .where(and(...conds))
    .orderBy(asc(sql`coalesce(${households.kana}, ${households.name})`), asc(households.name))
    .limit(opts.limit ?? 200);
  return rows.map(toSummary);
}

export type GetHouseholdOptions = {
  /** 「次の年忌」の基準の日（"YYYY-MM-DD"。省略すると今日） */
  today?: string;
  /** 対応記録を何件返すか（初期値 10） */
  contactLogLimit?: number;
};

/** 世帯の詳細（家族、故人、直近の対応記録）。ポータルの操作者は自分の世帯だけ見られる（対応記録は返さない） */
export async function getHousehold(
  actor: Actor,
  id: string,
  opts: GetHouseholdOptions = {},
  conn: DbOrTx = db,
): Promise<HouseholdDetail> {
  const row = await requireHouseholdRow(actor.templeId, id, conn);
  await assertCanReadHousehold(actor, id, conn);
  const preset = (await getTemple(actor.templeId, conn)).preset;
  const today = opts.today ?? todayJst();

  const people = await conn
    .select()
    .from(persons)
    .where(eq(persons.householdId, id))
    .orderBy(asc(persons.birthDate), asc(persons.familyName), asc(persons.givenName));

  const members: HouseholdMemberEntry[] = people
    .filter((p) => !p.isDeceased)
    .map((p) => ({
      id: p.id,
      familyName: p.familyName,
      givenName: p.givenName,
      name: fullName(p),
      kana: p.kana,
      gender: p.gender,
      relation: p.relation,
      birthDate: p.birthDate,
      mobilePhone: p.mobilePhone,
      email: p.email,
      isHead: p.id === row.headPersonId,
      isContact: p.id === row.contactPersonId,
    }))
    // 世帯主を先頭にする
    .sort((a, b) => Number(b.isHead) - Number(a.isHead));

  const deceased: DeceasedEntry[] = people
    .filter((p) => p.isDeceased)
    .sort((a, b) => (b.deathDate ?? "").localeCompare(a.deathDate ?? ""))
    .map((p) => ({
      id: p.id,
      name: fullName(p),
      kana: p.kana,
      gender: p.gender,
      relation: p.relation,
      homyo: p.homyo,
      deathDate: p.deathDate,
      ageAtDeath: p.ageAtDeath,
      notes: p.notes,
      nextMemorial: p.deathDate ? nextMemorial(p.deathDate, today, preset) : null,
    }));

  const byId = new Map(people.map((p) => [p.id, p]));
  const headP = row.headPersonId ? byId.get(row.headPersonId) : undefined;
  const contactP = row.contactPersonId ? byId.get(row.contactPersonId) : undefined;

  const logs = isStaff(actor) ? await listContactLogsRaw(id, opts.contactLogLimit ?? 10, conn) : [];

  return {
    id: row.id,
    name: row.name,
    kana: row.kana,
    address: row.address,
    phone: row.phone,
    status: row.status as HouseholdStatus,
    statusLabel: statusLabel(row.status),
    head: headP ? { id: headP.id, name: fullName(headP) } : null,
    contact: contactP ? { id: contactP.id, name: fullName(contactP) } : null,
    postalCode: row.postalCode,
    joinedOn: row.joinedOn,
    notes: row.notes,
    members,
    deceased,
    contactLogs: logs,
  };
}

export async function listContactLogsRaw(householdId: string, limit: number, conn: DbOrTx = db): Promise<ContactLogEntry[]> {
  const rows = await conn
    .select({
      id: contactLogs.id,
      householdId: contactLogs.householdId,
      kind: contactLogs.kind,
      body: contactLogs.body,
      staffName: staff.name,
      createdAt: contactLogs.createdAt,
    })
    .from(contactLogs)
    .leftJoin(staff, eq(staff.id, contactLogs.staffId))
    .where(eq(contactLogs.householdId, householdId))
    .orderBy(desc(contactLogs.createdAt))
    .limit(limit);
  return rows;
}

export type HouseholdMember = {
  id: string;
  householdId: string;
  familyName: string;
  givenName: string;
  /** "山田 太郎" */
  name: string;
  kana: string | null;
  birthDate: string | null;
  /** male / female */
  gender: string | null;
  /** 世帯主から見た続柄 */
  relation: string | null;
  mobilePhone: string | null;
  email: string | null;
  isHead: boolean;
  isContact: boolean;
};

/**
 * 世帯の生きている家族（05 の person_list の自動入力、06 のポータルで使う）。
 * 操作者を受け取らないので、呼ぶ側で権限を確かめてから使う。世帯主を先頭に、生年月日の順
 */
export async function getHouseholdMembers(householdId: string, conn: DbOrTx = db): Promise<HouseholdMember[]> {
  const [h] = await conn
    .select({ headPersonId: households.headPersonId, contactPersonId: households.contactPersonId })
    .from(households)
    .where(eq(households.id, householdId));
  if (!h) return [];
  const rows = await conn
    .select()
    .from(persons)
    .where(and(eq(persons.householdId, householdId), eq(persons.isDeceased, false)))
    .orderBy(asc(persons.birthDate), asc(persons.familyName), asc(persons.givenName));
  return rows
    .map((p) => toHouseholdMember(p, h))
    .sort((a, b) => Number(b.isHead) - Number(a.isHead));
}

function toHouseholdMember(
  p: typeof persons.$inferSelect,
  h: { headPersonId: string | null; contactPersonId: string | null },
): HouseholdMember {
  return {
    id: p.id,
    householdId: p.householdId,
    familyName: p.familyName,
    givenName: p.givenName,
    name: fullName(p),
    kana: p.kana,
    birthDate: p.birthDate,
    gender: p.gender,
    relation: p.relation,
    mobilePhone: p.mobilePhone,
    email: p.email,
    isHead: p.id === h.headPersonId,
    isContact: p.id === h.contactPersonId,
  };
}

/**
 * 生きている個人を 1 人取る（05 のポータルの回答者、06 のポータルの本人に使う）。故人やいない人なら null。
 * 操作者を受け取らないので、呼ぶ側で権限を確かめてから使う
 */
export async function getLivingMember(personId: string, conn: DbOrTx = db): Promise<HouseholdMember | null> {
  const [p] = await conn.select().from(persons).where(eq(persons.id, personId));
  if (!p || p.isDeceased) return null;
  const [h] = await conn
    .select({ headPersonId: households.headPersonId, contactPersonId: households.contactPersonId })
    .from(households)
    .where(eq(households.id, p.householdId));
  return toHouseholdMember(p, h ?? { headPersonId: null, contactPersonId: null });
}

/** 檀家（active）の世帯の一覧（05 の個別リンクの発行などに使う）。カナと名前の順 */
export async function listActiveHouseholds(
  templeId: string,
  conn: DbOrTx = db,
): Promise<{ id: string; name: string; address: string | null }[]> {
  return conn
    .select({ id: households.id, name: households.name, address: households.address })
    .from(households)
    .where(and(eq(households.templeId, templeId), eq(households.status, "active")))
    .orderBy(asc(households.kana), asc(households.name));
}

export type HouseholdBasics = {
  id: string;
  templeId: string;
  name: string;
  postalCode: string | null;
  address: string | null;
  phone: string | null;
  status: HouseholdStatus;
  headPersonId: string | null;
  contactPersonId: string | null;
};

/**
 * 世帯の基本の情報（名前、住所、固定電話、世帯主と窓口の ID）。05 のフォームの自動入力や 06 の窓口の判定で使う。
 * 操作者を受け取らないので、呼ぶ側で権限を確かめてから使う。なければ null
 */
export async function getHouseholdBasics(householdId: string, conn: DbOrTx = db): Promise<HouseholdBasics | null> {
  const [r] = await conn.select().from(households).where(eq(households.id, householdId));
  if (!r) return null;
  return {
    id: r.id,
    templeId: r.templeId,
    name: r.name,
    postalCode: r.postalCode,
    address: r.address,
    phone: r.phone,
    status: r.status as HouseholdStatus,
    headPersonId: r.headPersonId,
    contactPersonId: r.contactPersonId,
  };
}

export type HouseholdInput = {
  name: string;
  kana?: string | null;
  postalCode?: string | null;
  address?: string | null;
  phone?: string | null;
  status?: HouseholdStatus | string;
  joinedOn?: string | null;
  notes?: string | null;
};

function householdValues(input: HouseholdInput) {
  return {
    name: reqText(input.name, "世帯の名前", 50),
    kana: optText(input.kana, "世帯のカナ", 50),
    postalCode: optText(input.postalCode, "郵便番号", 10),
    address: optText(input.address, "住所", 200),
    phone: optText(input.phone, "電話", 30),
    status: reqStatus(input.status),
    joinedOn: optDate(input.joinedOn, "入檀日"),
    notes: optText(input.notes, "備考", 2000),
  };
}

/** 世帯を作る。世帯主と窓口は、家族を登録したあとで決まる（最初に登録した生きている人が、両方の初期値になる） */
export async function createHousehold(actor: Actor, input: HouseholdInput, conn: DbOrTx = db): Promise<{ id: string }> {
  assertStaff(actor);
  const [row] = await conn
    .insert(households)
    .values({ templeId: actor.templeId, ...householdValues(input) })
    .returning({ id: households.id });
  return row;
}

/** 世帯の情報を更新する（離檀や転出も、ここで状態を変える。物理削除はしない） */
export async function updateHousehold(
  actor: Actor,
  id: string,
  input: HouseholdInput,
  conn: DbOrTx = db,
): Promise<void> {
  assertStaff(actor);
  await requireHouseholdRow(actor.templeId, id, conn);
  await conn.update(households).set(householdValues(input)).where(eq(households.id, id));
}

/**
 * 世帯主と窓口を設定する。どちらも、その世帯の生きている人でなければならない。
 * 窓口を指定せず、まだ窓口がいなければ、世帯主を窓口にする（窓口の初期値は世帯主）
 */
export async function setHouseholdRoles(
  actor: Actor,
  householdId: string,
  input: { headPersonId?: string | null; contactPersonId?: string | null },
  conn: DbOrTx = db,
): Promise<void> {
  assertStaff(actor);
  const row = await requireHouseholdRow(actor.templeId, householdId, conn);
  const ids = [input.headPersonId, input.contactPersonId].filter((x): x is string => !!x);
  const found = ids.length
    ? await conn
        .select({ id: persons.id, isDeceased: persons.isDeceased })
        .from(persons)
        .where(and(eq(persons.householdId, householdId), inArray(persons.id, ids)))
    : [];
  const check = (pid: string | null | undefined, label: string) => {
    if (!pid) return;
    const p = found.find((f) => f.id === pid);
    if (!p) throw invalid(`${label}は、この世帯の人から選んでください`);
    if (p.isDeceased) throw invalid(`${label}に故人は選べません`);
  };
  check(input.headPersonId, "世帯主");
  check(input.contactPersonId, "窓口");

  const next: { headPersonId?: string | null; contactPersonId?: string | null } = {};
  if (input.headPersonId !== undefined) next.headPersonId = input.headPersonId;
  if (input.contactPersonId !== undefined) next.contactPersonId = input.contactPersonId;
  if (input.contactPersonId === undefined && !row.contactPersonId && input.headPersonId) {
    next.contactPersonId = input.headPersonId;
  }
  if (Object.keys(next).length) await conn.update(households).set(next).where(eq(households.id, householdId));
}

/** 世帯の名前（〇〇家）をまとめて引く（03 の予約の一覧などで使う） */
export async function getHouseholdNamesByIds(ids: string[], conn: DbOrTx = db): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await conn
    .select({ id: households.id, name: households.name })
    .from(households)
    .where(inArray(households.id, ids));
  for (const r of rows) out.set(r.id, r.name);
  return out;
}
