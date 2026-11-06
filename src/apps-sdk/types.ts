// お寺のアプリの型。DB に依存しない（アプリと画面から import する）。spec.md §7
import type { ReactNode } from "react";

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
};

/** 文書 1 件。data の形はアプリが決める（JSON にできる値） */
export type AppDocument<T = unknown> = {
  id: string;
  /** ISO 8601 の日時 */
  createdAt: string;
  updatedAt: string;
  data: T;
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

/** アプリの定義（manifest）。ドメイン層が使う */
export type AppDefinition = { manifest: AppManifest };

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
