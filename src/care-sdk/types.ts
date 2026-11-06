// ケアのツール（プラグイン）の型。DB に依存しない（プラグインと画面から import する）。spec.md §7
import type { ReactNode } from "react";
import type { z } from "zod";

type FieldBase = {
  /** 項目の ID（英小文字と数字と _） */
  id: string;
  label: string;
  /** 項目の下に出す説明 */
  help?: string;
  required?: boolean;
};

/** 1 行の文字。必ず危機検知の対象になる */
export type CareTextField = FieldBase & { type: "text"; maxLength?: number; placeholder?: string };
/** 自由記述。必ず危機検知の対象になる */
export type CareTextareaField = FieldBase & { type: "textarea"; maxLength?: number; placeholder?: string; rows?: number };
/** 段階（例: 1〜5）。labels で各段階の言葉を決められる */
export type CareScaleField = FieldBase & {
  type: "scale";
  min: number;
  max: number;
  labels?: Record<number, string>;
};
/** 選択肢から 1 つ。crisis: true にすると、選んだ選択肢の言葉も危機検知の対象になる */
export type CareChoiceField = FieldBase & {
  type: "choice";
  options: { value: string; label: string }[];
  crisis?: boolean;
};

export type CareField = CareTextField | CareTextareaField | CareScaleField | CareChoiceField;
export type CareFieldType = CareField["type"];

export type CareManifest = {
  /** ディレクトリの名前（tools/<id>/）と同じにする */
  id: string;
  name: string;
  /** ツールの一覧に出す説明（1〜2 文） */
  description: string;
  /** 絵文字 1 つ */
  icon: string;
  fields: CareField[];
};

/** 記録 1 件の中身（項目の ID → 値） */
export type CareEntryData = Record<string, string | number | undefined>;

/** 画面に渡す記録（本体が復号したもの） */
export type CareEntryView<T = CareEntryData> = {
  id: string;
  createdAt: Date;
  /** 危機兆候を検知した記録か */
  crisis: boolean;
  data: T;
};

/** 保存の action（本体が作って渡す。プラグインは <form action={action}> に渡すだけ） */
export type CareSaveAction = (formData: FormData) => void | Promise<void>;

export type CareEntryProps = { manifest: CareManifest; action: CareSaveAction };
export type CareHistoryProps<T = CareEntryData> = { manifest: CareManifest; entries: CareEntryView<T>[] };
export type CareAdminViewProps<T = CareEntryData> = {
  manifest: CareManifest;
  entries: CareEntryView<T>[];
  /** 相談者のニックネーム */
  nickname: string;
};

/** プラグインのデータの部分（manifest と schema）。ドメイン層が使う */
export type CareToolDefinition = {
  manifest: CareManifest;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<any>;
};

/** プラグインの画面の部分。ケアのポータルと管理画面が使う */
export type CareToolViews = {
  Entry: (props: CareEntryProps) => ReactNode | Promise<ReactNode>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  History: (props: CareHistoryProps<any>) => ReactNode | Promise<ReactNode>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AdminView: (props: CareAdminViewProps<any>) => ReactNode | Promise<ReactNode>;
};

/** manifest を定義する（型を付けるだけ） */
export function defineCareManifest<const M extends CareManifest>(manifest: M): M {
  return manifest;
}

/** 危機検知の対象になる項目か（text と textarea は必ず対象） */
export function isCrisisTarget(field: CareField): boolean {
  if (field.type === "text" || field.type === "textarea") return true;
  if (field.type === "choice") return field.crisis === true;
  return false;
}
