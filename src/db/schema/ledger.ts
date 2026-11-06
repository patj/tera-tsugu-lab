// 台帳（ledger）のテーブル: households、persons、person_relations、contacts、contact_logs（spec.md §2、§9）
import {
  boolean,
  date,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createdAt, id, staff, templeId, updatedAt } from "./core";

export const households = pgTable("households", {
  id: id(),
  templeId: templeId(),
  /** 〇〇家 */
  name: text("name").notNull(),
  kana: text("kana"),
  /** 世帯主 */
  headPersonId: uuid("head_person_id").references((): AnyPgColumn => persons.id),
  /** 窓口（ポータルで家を代表する人。初期値は世帯主） */
  contactPersonId: uuid("contact_person_id").references((): AnyPgColumn => persons.id),
  postalCode: text("postal_code"),
  address: text("address"),
  /** 固定電話 */
  phone: text("phone"),
  /** お墓の場所（住所。境内の墓地なら空）。墓前の法要の場所の初期値にする（spec.md §2、§3） */
  graveAddress: text("grave_address"),
  /** active（檀家）/ left（離檀）/ moved（転出） */
  status: text("status").notNull().default("active"),
  joinedOn: date("joined_on"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const persons = pgTable("persons", {
  id: id(),
  templeId: templeId(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id),
  familyName: text("family_name").notNull(),
  givenName: text("given_name").notNull(),
  kana: text("kana"),
  /** male / female */
  gender: text("gender"),
  /** 世帯主から見た続柄 */
  relation: text("relation"),
  birthDate: date("birth_date"),
  mobilePhone: text("mobile_phone"),
  email: text("email"),
  isDeceased: boolean("is_deceased").notNull().default(false),
  deathDate: date("death_date"),
  /** 法号 */
  homyo: text("homyo"),
  /** 享年（行年） */
  ageAtDeath: integer("age_at_death"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 家系図のための関係。kind = parent のとき、related_person_id は person_id の親 */
export const personRelations = pgTable(
  "person_relations",
  {
    id: id(),
    templeId: templeId(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    relatedPersonId: uuid("related_person_id")
      .notNull()
      .references(() => persons.id),
    /** parent / spouse */
    kind: text("kind").notNull(),
  },
  (t) => [uniqueIndex("person_relations_unique").on(t.personId, t.relatedPersonId, t.kind)],
);

/** 檀家ではない外部の人（前撮りの申込者など） */
export const contacts = pgTable("contacts", {
  id: id(),
  templeId: templeId(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  createdAt: createdAt(),
});

export const contactLogs = pgTable("contact_logs", {
  id: id(),
  templeId: templeId(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id),
  staffId: uuid("staff_id").references(() => staff.id),
  /** 案内 / 電話 / 来寺 / その他 */
  kind: text("kind").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});
