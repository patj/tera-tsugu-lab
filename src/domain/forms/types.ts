// 行事・アンケートフォーム（forms）の型（spec.md §5）
import type { PersonListItemField, ProfileField } from "@/db/schema";

export type { PersonListItemField, ProfileField };

export const FORM_MODES = ["public", "members", "both"] as const;
export type FormMode = (typeof FORM_MODES)[number];

export const FORM_STATUSES = ["draft", "open", "closed"] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

export const QUESTION_TYPES = ["single", "multi", "short", "long", "number", "date", "person_list"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** person_list の 1 人分の項目の種類 */
export const ITEM_FIELD_TYPES = ["short", "long", "single", "date", "number"] as const;
export type ItemFieldType = (typeof ITEM_FIELD_TYPES)[number];

export const PROFILE_FIELDS = ["name", "kana", "birth_date", "gender", "address", "phone", "email"] as const;
/** person_list の項目で、台帳から補える項目（個人の項目だけ） */
export const PERSON_PROFILE_FIELDS = ["name", "kana", "birth_date", "gender"] as const;
export type PersonProfileField = (typeof PERSON_PROFILE_FIELDS)[number];

/** 回答の入口 */
export const RESPONSE_SOURCES = ["public", "member_link", "portal"] as const;
export type ResponseSource = (typeof RESPONSE_SOURCES)[number];

export type Form = {
  id: string;
  templeId: string;
  title: string;
  description: string | null;
  mode: FormMode;
  status: FormStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type FormQuestion = {
  id: string;
  formId: string;
  type: QuestionType;
  label: string;
  description: string | null;
  options: string[] | null;
  required: boolean;
  profileField: ProfileField | null;
  position: number;
  maxPersons: number | null;
  itemFields: PersonListItemField[] | null;
};

export type FormWithQuestions = Form & { questions: FormQuestion[] };

/** 設問を作るときの入力（管理画面のビルダーと MCP の create_form で共通） */
export type QuestionInput = {
  type: QuestionType;
  label: string;
  description?: string | null;
  required?: boolean;
  options?: string[] | null;
  profileField?: ProfileField | null;
  maxPersons?: number | null;
  itemFields?: ItemFieldInput[] | null;
};

export type ItemFieldInput = {
  /** 省略すると、profileField か f1, f2… から作る */
  key?: string;
  label: string;
  type: ItemFieldType;
  required?: boolean;
  options?: string[] | null;
  profileField?: PersonProfileField | null;
};

export type FormInput = {
  title: string;
  description?: string | null;
  mode: FormMode;
  status?: FormStatus;
  questions: QuestionInput[];
};

/** person_list の 1 人分の回答。personId は、台帳の家族を選んだとき */
export type PersonEntry = { personId?: string; values: Record<string, string> };

/**
 * 回答（設問の ID → 値）。
 * single / short / long / date: string、multi: string[]、number: number、person_list: PersonEntry[]
 */
export type Answers = Record<string, unknown>;

export type FormResponse = {
  id: string;
  formId: string;
  householdId: string | null;
  personId: string | null;
  respondentName: string | null;
  contact: string | null;
  answers: Answers;
  source: ResponseSource;
  createdAt: Date;
};
