// 行事・アンケートフォーム（forms）のテーブル: forms、form_questions、form_household_tokens、form_responses（spec.md §5、§9）
import { boolean, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, templeId, updatedAt } from "./core";
import { households, persons } from "./ledger";

export const forms = pgTable("forms", {
  id: id(),
  templeId: templeId(),
  title: text("title").notNull(),
  description: text("description"),
  /** public / members / both */
  mode: text("mode").notNull(),
  /** draft / open / closed */
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 台帳で補える項目 */
export type ProfileField =
  | "name"
  | "kana"
  | "birth_date"
  | "gender"
  | "address"
  | "phone"
  | "email";

/** person_list の 1 人分の項目 */
export type PersonListItemField = {
  key: string;
  label: string;
  /** short / long / single / date など */
  type: string;
  required?: boolean;
  options?: string[];
  profileField?: ProfileField;
};

export const formQuestions = pgTable("form_questions", {
  id: id(),
  templeId: templeId(),
  formId: uuid("form_id")
    .notNull()
    .references(() => forms.id),
  /** single / multi / short / long / number / date / person_list */
  type: text("type").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  options: jsonb("options").$type<string[]>(),
  required: boolean("required").notNull().default(false),
  /** 台帳で補える設問なら、その項目。個別リンクとポータルからは表示しない */
  profileField: text("profile_field").$type<ProfileField>(),
  position: integer("position").notNull(),
  /** person_list の最大人数 */
  maxPersons: integer("max_persons"),
  /** person_list の 1 人分の項目 */
  itemFields: jsonb("item_fields").$type<PersonListItemField[]>(),
});

export const formHouseholdTokens = pgTable(
  "form_household_tokens",
  {
    token: text("token").primaryKey(),
    templeId: templeId(),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
  },
  (t) => [uniqueIndex("form_household_tokens_unique").on(t.formId, t.householdId)],
);

export const formResponses = pgTable("form_responses", {
  id: id(),
  templeId: templeId(),
  formId: uuid("form_id")
    .notNull()
    .references(() => forms.id),
  householdId: uuid("household_id").references(() => households.id),
  /** ポータルから申し込んだ人 */
  personId: uuid("person_id").references(() => persons.id),
  respondentName: text("respondent_name"),
  contact: text("contact"),
  answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
  /** portal / member_link / public */
  source: text("source").notNull(),
  createdAt: createdAt(),
});
