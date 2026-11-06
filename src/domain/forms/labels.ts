// 画面と MCP に出す、フォームの用語の日本語の名前
import type { FormMode, FormStatus, ItemFieldType, ProfileField, QuestionType, ResponseSource } from "./types";

export const MODE_LABELS: Record<FormMode, string> = {
  public: "一般向け（共通リンクだけ）",
  members: "檀家向け（世帯ごとの個別リンクだけ）",
  both: "檀家と一般の両方（個別リンクと共通リンク）",
};

export const STATUS_LABELS: Record<FormStatus, string> = {
  draft: "下書き",
  open: "受付中",
  closed: "締め切り",
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: "単一選択",
  multi: "複数選択",
  short: "短い記述",
  long: "長い記述",
  number: "数値",
  date: "日付",
  person_list: "人ごとの項目",
};

export const ITEM_FIELD_TYPE_LABELS: Record<ItemFieldType, string> = {
  short: "短い記述",
  long: "長い記述",
  single: "単一選択",
  date: "日付",
  number: "数値",
};

export const PROFILE_FIELD_LABELS: Record<ProfileField, string> = {
  name: "氏名",
  kana: "カナ",
  birth_date: "生年月日",
  gender: "性別",
  address: "住所",
  phone: "電話",
  email: "メール",
};

export const SOURCE_LABELS: Record<ResponseSource, string> = {
  public: "共通リンク",
  member_link: "個別リンク",
  portal: "ポータル",
};

/** 檀家（世帯にひもづく回答）か一般か */
export function respondentKindLabel(source: ResponseSource): "檀家" | "一般" {
  return source === "public" ? "一般" : "檀家";
}
