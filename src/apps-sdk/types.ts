// お寺のアプリの型。DB に依存しない（アプリと画面から import する）。spec.md §7
// このファイルは、開発キット（kit/）にもそのままコピーされる（npm run kit:build）。本体とキットの API の形をそろえるため
import type { ReactNode } from "react";
import type { z } from "zod";

/** AI に使えるモデル（運用者が許したもの。spec.md §7「AI」） */
export const APP_AI_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type AppAIModel = (typeof APP_AI_MODELS)[number];
export const APP_AI_DEFAULT_MODEL: AppAIModel = "claude-opus-5-5";
/** 考える深さ（output_config.effort） */
export const APP_AI_EFFORTS = ["low", "medium", "high"] as const;
export type AppAIEffort = (typeof APP_AI_EFFORTS)[number];

export type AppManifest = {
  /** ディレクトリの名前（apps/<id>/）と同じにする。英小文字・数字・- */
  id: string;
  name: string;
  /** アプリの一覧に出す説明（1〜2 文） */
  description: string;
  /** 絵文字 1 つ */
  icon: string;
  /** お寺との共有を使うか（true なら、利用者が共有を選べ、Admin.tsx が必要） */
  sharing: boolean;
  /** 画面の出し方。"framed"（お寺の画面の中。初期値）/ "fullscreen"（アプリが画面全体を使う。右上の 48px 四方はあけておく） */
  display?: "framed" | "fullscreen";
  /** ホーム画面に追加したときの見た目。icon は assets/ の中の 512×512 の PNG */
  pwa?: { themeColor: string; backgroundColor: string; icon: string };
  /** 保存の上限。maxDocs は 1〜10,000（初期値 1,000） */
  storage?: { maxDocs?: number };
  /** AI を使うとき。利用者への説明（同意の画面に出る）と、モデル、1 日の回数の上限 */
  ai?: {
    /** 何のために送るか（例: 「日記から、その日の服を仕立てるため」） */
    purpose: string;
    /** 何を送るか（例: ["日記の文字", "気分スタンプ", "服の写真"]） */
    sends: string[];
    /** 初期値 claude-opus-5-5 */
    model?: AppAIModel;
    /** 利用者ごとの 1 日の回数の上限（1〜100。初期値 20） */
    dailyLimit?: number;
  };
};

/** 文書 1 件。data の形はアプリが決める（JSON にできる値） */
export type AppDocument<T = unknown> = {
  id: string;
  /** ISO 8601 の日時 */
  createdAt: string;
  updatedAt: string;
  data: T;
};

/** useAppStorage() が返すもの */
export type AppStorage<T> = {
  /** 自分の文書（新しい順） */
  docs: AppDocument<T>[];
  /** 保存の途中か */
  pending: boolean;
  /** 直前の操作のエラー（利用者に見せてよい文） */
  error: string | null;
  /** 文書を作る。失敗したら null（error に理由が入る） */
  create: (data: T) => Promise<AppDocument<T> | null>;
  /** 文書を置き換える。失敗したら null */
  update: (id: string, data: T) => Promise<AppDocument<T> | null>;
  /** 文書を消す（元に戻せない）。失敗したら false */
  remove: (id: string) => Promise<boolean>;
  /** 自分の文書をすべて消す（元に戻せない）。失敗したら false */
  removeAll: () => Promise<boolean>;
  clearError: () => void;
};

/** useAppSharing() が返すもの */
export type AppSharing = {
  /** アプリがお寺との共有に対応しているか（manifest の sharing） */
  available: boolean;
  /** 今、お寺と共有しているか */
  shared: boolean;
  /** 変更の途中か */
  pending: boolean;
  /** 直前の操作のエラー（利用者に見せてよい文） */
  error: string | null;
  /** 共有する。オンにする前に、何が共有されるかを本人に説明すること（apps/CLAUDE.md）。成功すると true */
  share: () => Promise<boolean>;
  /** 共有をやめる。成功すると true */
  unshare: () => Promise<boolean>;
};

/** AI の仕事 1 つ（ai.ts の defineAppAI に書く）。リクエストは基盤が組み立てる */
export type AppAITask<Out extends z.ZodType = z.ZodType> = {
  /** Claude への指示（system に入る固定の文。利用者の入力を混ぜない） */
  instructions: string;
  /** 返してほしい形（zod。z.object(...)）。選択肢は z.enum にすると API が守る */
  output: Out;
  /** 受け付ける文字の上限（初期値 4,000。最大 20,000） */
  maxTextChars?: number;
  /** 受け付ける画像の枚数（初期値 0。最大 4） */
  maxImages?: number;
  /** 考える深さ（初期値 "low"） */
  effort?: AppAIEffort;
  /** 返事の上限のトークン数（考える分を含む。初期値 8,000。最大 16,000） */
  maxOutputTokens?: number;
};
export type AppAITasks = Record<string, AppAITask>;

/** ai.ts で AI の仕事を宣言する（型を付けるだけ） */
export function defineAppAI<const T extends AppAITasks>(tasks: T): T {
  return tasks;
}

/** useAppAI().run に渡す入力。画像は SDK が縮めてから送る */
export type AppAIInput = { text?: string; images?: Blob[] };

/**
 * AI の失敗の種類。アプリはどれでも止まらないようにする（例: 辞書で選ぶ、あとでもう一度）
 * - needs_consent: 利用者が AI への送信に同意していない
 * - limit: 回数や費用の上限に達した
 * - refusal: Claude が応えられない内容だった
 * - unavailable: 使えない（キーがない、混み合っている、通信できない）
 * - invalid_output: 返事の形が正しくなかった
 * - invalid_input: 入力が大きすぎる、画像の形式が違うなど
 */
export type AppAIErrorKind = "needs_consent" | "limit" | "refusal" | "unavailable" | "invalid_output" | "invalid_input";
export type AppAIResult<T> = { ok: true; data: T } | { ok: false; kind: AppAIErrorKind; message: string };

/** useAppAI() が返すもの */
export type AppAI<Tasks extends AppAITasks = AppAITasks> = {
  /** アプリが AI を使うか（manifest の ai） */
  available: boolean;
  /** 利用者が AI への送信に同意しているか */
  consented: boolean;
  /** 基盤の同意の画面を出す。同意したら true */
  requestConsent: () => Promise<boolean>;
  /** AI を呼ぶ。同意していなければ、先に基盤の同意の画面を出す */
  run: <K extends keyof Tasks & string>(task: K, input: AppAIInput) => Promise<AppAIResult<z.infer<Tasks[K]["output"]>>>;
  /** 呼び出しの途中か */
  pending: boolean;
};

/** useAppAssets() が返すもの（assets/ の中のパスを渡す。例: "img/door.webp"） */
export type AppAssets = {
  /** 画面で使う URL（img の src、CSS の url() など） */
  url: (path: string) => string;
  /** data URL として読み込む（PNG に書き出すときに、SVG に埋め込むなど） */
  dataUrl: (path: string) => Promise<string>;
};

/** App.tsx の props */
export type AppProps = { manifest: AppManifest };

/** Admin.tsx の props（共有されている文書。新しい順。読むだけ） */
export type AppAdminProps<T = unknown> = {
  manifest: AppManifest;
  docs: AppDocument<T>[];
  /** 利用者のニックネーム */
  nickname: string;
};

/** アプリの定義（manifest と AI の仕事）。ドメイン層が使う */
export type AppDefinition = { manifest: AppManifest; ai?: AppAITasks };

/** アプリの画面。利用者の画面と管理画面が使う */
export type AppViews = {
  App: (props: AppProps) => ReactNode | Promise<ReactNode>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Admin?: (props: AppAdminProps<any>) => ReactNode | Promise<ReactNode>;
};

/** manifest を定義する（型を付けるだけ） */
export function defineAppManifest<const M extends AppManifest>(manifest: M): M {
  return manifest;
}

/** 文書の上限（spec.md §7） */
export const APP_DOCUMENT_MAX_BYTES = 100 * 1024;
export const APP_DOCUMENTS_MAX_PER_APP = 1000;
export const APP_DOCUMENTS_MAX_LIMIT = 10_000;

/** このアプリの文書の件数の上限 */
export function appMaxDocs(manifest: AppManifest): number {
  const n = manifest.storage?.maxDocs;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? Math.min(n, APP_DOCUMENTS_MAX_LIMIT) : APP_DOCUMENTS_MAX_PER_APP;
}

/** AI の上限（spec.md §7「AI」） */
export const APP_AI_LIMITS = {
  maxTextChars: 20_000,
  defaultTextChars: 4_000,
  maxImages: 4,
  maxImageBytes: 5 * 1024 * 1024,
  /** SDK が縮める長辺（px） */
  imageMaxSide: 1568,
  maxOutputTokens: 16_000,
  defaultOutputTokens: 8_000,
  defaultDailyLimit: 20,
  maxDailyLimit: 100,
} as const;

/** 素材の決まり（spec.md §7「素材」）。SVG は不可 */
export const APP_ASSET_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "avif", "mp3", "m4a", "ogg", "wav", "woff2"] as const;
export const APP_ASSET_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const APP_ASSET_MAX_TOTAL_BYTES = 30 * 1024 * 1024;

/** AI の同意の版（purpose と sends が変わったら変わる。変わったら、もう一度同意を聞く） */
export function appAIConsentVersion(manifest: AppManifest): string {
  if (!manifest.ai) return "";
  const text = JSON.stringify([manifest.ai.purpose, [...manifest.ai.sends].sort()]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Anthropic 社でのデータの扱いの説明（同意の画面に出す）。運用者が公開の前に規約で確かめて書き直す（spec.md §7） */
export const APP_AI_PROVIDER_NOTE = "送った内容は、Anthropic 社の規約にもとづいて扱われます。";
