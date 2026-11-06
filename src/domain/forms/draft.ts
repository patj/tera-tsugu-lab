// フォームと設問の入力の検証と正規化（管理画面のビルダーと MCP の create_form で共通）
import { invalid } from "@/domain/core";
import {
  FORM_MODES,
  FORM_STATUSES,
  ITEM_FIELD_TYPES,
  PERSON_PROFILE_FIELDS,
  PROFILE_FIELDS,
  QUESTION_TYPES,
  type FormInput,
  type FormMode,
  type FormStatus,
  type ItemFieldInput,
  type PersonListItemField,
  type ProfileField,
  type QuestionInput,
  type QuestionType,
} from "./types";

export const MAX_TITLE = 100;
export const MAX_LABEL = 200;
export const MAX_DESCRIPTION = 2000;
export const MAX_OPTIONS = 30;
export const MAX_PERSONS_LIMIT = 20;
export const DEFAULT_MAX_PERSONS = 5;
export const MAX_QUESTIONS = 50;
export const MAX_ITEM_FIELDS = 15;

/** 正規化した設問（DB に入れる形） */
export type NormalizedQuestion = {
  type: QuestionType;
  label: string;
  description: string | null;
  required: boolean;
  options: string[] | null;
  profileField: ProfileField | null;
  maxPersons: number | null;
  itemFields: PersonListItemField[] | null;
};

export type NormalizedForm = {
  title: string;
  description: string | null;
  mode: FormMode;
  status: FormStatus;
  questions: NormalizedQuestion[];
};

function text(value: string | null | undefined, max: number, what: string): string | null {
  const s = (value ?? "").trim();
  if (!s) return null;
  if (s.length > max) throw invalid(`${what}は ${max} 文字までにしてください`);
  return s;
}

function requiredText(value: string | null | undefined, max: number, what: string): string {
  const s = text(value, max, what);
  if (!s) throw invalid(`${what}を入力してください`);
  return s;
}

function normalizeOptions(options: string[] | null | undefined, where: string): string[] {
  const list = (options ?? []).map((o) => o.trim()).filter((o) => o !== "");
  if (list.length === 0) throw invalid(`${where}: 選択肢を 1 つ以上入れてください`);
  if (list.length > MAX_OPTIONS) throw invalid(`${where}: 選択肢は ${MAX_OPTIONS} 個までにしてください`);
  if (new Set(list).size !== list.length) throw invalid(`${where}: 同じ選択肢が重なっています`);
  for (const o of list) if (o.length > MAX_LABEL) throw invalid(`${where}: 選択肢は ${MAX_LABEL} 文字までにしてください`);
  return list;
}

export function isQuestionType(v: unknown): v is QuestionType {
  return (QUESTION_TYPES as readonly unknown[]).includes(v);
}
export function isFormMode(v: unknown): v is FormMode {
  return (FORM_MODES as readonly unknown[]).includes(v);
}
export function isFormStatus(v: unknown): v is FormStatus {
  return (FORM_STATUSES as readonly unknown[]).includes(v);
}

function normalizeItemFields(fields: ItemFieldInput[] | null | undefined, where: string): PersonListItemField[] {
  const list = fields ?? [];
  if (list.length === 0) throw invalid(`${where}: 1 人分の項目を 1 つ以上入れてください`);
  if (list.length > MAX_ITEM_FIELDS) throw invalid(`${where}: 1 人分の項目は ${MAX_ITEM_FIELDS} 個までにしてください`);
  const keys = new Set<string>();
  const profiles = new Set<string>();
  return list.map((f, i) => {
    const fw = `${where}の項目 ${i + 1}`;
    if (!(ITEM_FIELD_TYPES as readonly unknown[]).includes(f.type)) throw invalid(`${fw}: 項目の種類が正しくありません`);
    const profileField = f.profileField ?? null;
    if (profileField && !(PERSON_PROFILE_FIELDS as readonly unknown[]).includes(profileField)) {
      throw invalid(`${fw}: 台帳から補える項目は 氏名、カナ、生年月日、性別 だけです`);
    }
    if (profileField) {
      if (profiles.has(profileField)) throw invalid(`${fw}: 台帳から補う項目が重なっています`);
      profiles.add(profileField);
    }
    const key = (f.key ?? "").trim() || profileField || `f${i + 1}`;
    if (!/^[A-Za-z0-9_]{1,40}$/.test(key)) throw invalid(`${fw}: 項目のキーは英数字にしてください`);
    if (keys.has(key)) throw invalid(`${fw}: 項目のキー「${key}」が重なっています`);
    keys.add(key);
    const out: PersonListItemField = {
      key,
      label: requiredText(f.label, MAX_LABEL, `${fw}の名前`),
      type: f.type,
      required: Boolean(f.required),
    };
    if (f.type === "single") out.options = normalizeOptions(f.options, fw);
    if (profileField) out.profileField = profileField;
    return out;
  });
}

export function normalizeQuestion(q: QuestionInput, index: number): NormalizedQuestion {
  const where = `設問 ${index + 1}`;
  if (!isQuestionType(q.type)) throw invalid(`${where}: 設問の種類が正しくありません`);
  const profileField = q.profileField ?? null;
  if (profileField && !(PROFILE_FIELDS as readonly unknown[]).includes(profileField)) {
    throw invalid(`${where}: 台帳で補う項目が正しくありません`);
  }
  if (profileField && q.type === "person_list") {
    throw invalid(`${where}: 人ごとの項目の設問そのものには、台帳で補う項目を指定できません（1 人分の項目ごとに指定します）`);
  }
  const isChoice = q.type === "single" || q.type === "multi";
  let maxPersons: number | null = null;
  if (q.type === "person_list") {
    maxPersons = q.maxPersons ?? DEFAULT_MAX_PERSONS;
    if (!Number.isInteger(maxPersons) || maxPersons < 1 || maxPersons > MAX_PERSONS_LIMIT) {
      throw invalid(`${where}: 最大人数は 1〜${MAX_PERSONS_LIMIT} 人にしてください`);
    }
  }
  return {
    type: q.type,
    label: requiredText(q.label, MAX_LABEL, `${where}の文言`),
    description: text(q.description, MAX_DESCRIPTION, `${where}の説明`),
    required: Boolean(q.required),
    options: isChoice ? normalizeOptions(q.options, where) : null,
    profileField,
    maxPersons,
    itemFields: q.type === "person_list" ? normalizeItemFields(q.itemFields, where) : null,
  };
}

/** フォーム全体の入力を検証して正規化する。だめなら DomainError（invalid） */
export function validateFormDraft(input: FormInput): NormalizedForm {
  if (!isFormMode(input.mode)) throw invalid("公開範囲は public / members / both のどれかにしてください");
  const status = input.status ?? "draft";
  if (!isFormStatus(status)) throw invalid("状態は draft / open / closed のどれかにしてください");
  if (input.questions.length > MAX_QUESTIONS) throw invalid(`設問は ${MAX_QUESTIONS} 個までにしてください`);
  const questions = input.questions.map(normalizeQuestion);
  if (status === "open" && questions.length === 0) throw invalid("設問が 1 つもないフォームは受付中にできません");
  return {
    title: requiredText(input.title, MAX_TITLE, "フォームの題名"),
    description: text(input.description, MAX_DESCRIPTION, "フォームの説明"),
    mode: input.mode,
    status,
    questions,
  };
}

/** 一般の人も答えるフォームで、連絡先を聞く設問がないときの注意（MCP のプレビューと管理画面に出す） */
export function draftWarnings(form: Pick<NormalizedForm, "mode" | "questions">): string[] {
  const warnings: string[] = [];
  if (form.mode !== "members") {
    const hasName = form.questions.some((q) => q.profileField === "name");
    const hasContact = form.questions.some((q) => q.profileField === "phone" || q.profileField === "email");
    if (!hasName || !hasContact) {
      warnings.push(
        "一般の方の代表者の氏名と連絡先（電話かメール）を聞く設問（profile_field が name と phone / email）がありません。一般の方に連絡できなくなります",
      );
    }
  }
  return warnings;
}
