# お寺のアプリ（apps/）を作るときのルール

このディレクトリには「お寺のアプリ」を置く。住職が「欲しい」と思った小さな機能（日記、占い、写経の記録など）を、1 つのアプリ = 1 つのディレクトリ（`apps/<app-id>/`）で作る。
人向けの手順書は [docs/apps-guide.md](../docs/apps-guide.md)、仕様は [docs/spec.md](../docs/spec.md) §7。

アプリの利用者は匿名で、データ（文書）は本人のもの。利用者が「お寺と共有する」を選んだアプリのデータだけを、スタッフが読める。
保存、暗号化、共有の履歴、監査ログは本体（基盤）が受け持つ。アプリの側では、次のルールを必ず守る。

## 絶対に守ること

1. **データは `useAppStorage` だけで読み書きする**。DB、ファイル、cookie、`localStorage` などに触らない
2. **import できるのは `@/apps-sdk`、`react`、`zod`、自分のディレクトリの中のファイルだけ**。`@/db`、`@/domain`、`@/lib`、`next/*`、`node:*`、npm のパッケージは使わない
3. **外部に送信しない**。`fetch`、`XMLHttpRequest`、`WebSocket`、外部の URL（画像、フォント、リンクを含む）を使わない
4. `process.env`、`eval`、`"use server"`、`dangerouslySetInnerHTML`、`<script>`、`<iframe>` を使わない
5. **共有をオンにする前に、何が共有されるかを本人に説明する**（お寺の方が読めるようになる、これまでの分も含む、読むだけ、いつでもやめられる）。説明なしに `share()` を呼ばない。画面を開いただけで共有したり、ほかの操作に紛れて共有したりしない
6. **本体（`src/` など）のファイルは変えない**。基盤に足りない機能があれば、無理をせず、その旨を伝える
7. 作ったら、必ず `npm run apps:gen` と `npm run apps:check` を流し、違反を 0 にする

`apps:check` は正規表現のチェックなので、悪意のある書き方までは見抜けない。公開の前に、人がコードを読む。

## ファイルの構成

`apps/_template/` をコピーして作る（`_` で始まるディレクトリは一覧に載らない）。

| ファイル | 内容 |
|---|---|
| `manifest.ts` | `export const manifest = defineAppManifest({ id, name, description, icon, sharing })`。`id` はディレクトリの名前と同じ（英小文字・数字・`-`。`api` は使えない） |
| `App.tsx` | 利用者の画面。先頭に `"use client"`。`export default function App({ manifest }: AppProps)` |
| `Admin.tsx` | スタッフの画面（`sharing: true` のときは必須）。`export default function Admin({ manifest, docs, nickname }: AppAdminProps<T>)`。表示するだけ（読むだけ） |
| `types.ts` など | 文書の data の型や、画面の部品。自由に足してよい |
| `README.md` | 目的、だれ向けか、文書の形、画面の説明、共有を使うか |

本体は、アプリの画面の上に帯を出す（アプリの名前、共有に対応したアプリなら今の状態「お寺と共有中 / 自分だけ」と、基盤の共有の設定の画面へのリンク）。帯は消せない。
共有のボタンや文言、置き場所は、アプリが `useAppSharing()` で自由に作ってよい（作らなければ、利用者は帯のリンクから基盤の画面で設定する）。

## `@/apps-sdk`

```tsx
"use client";
import { useAppStorage, type AppProps } from "@/apps-sdk";

type Entry = { date: string; text: string };

export default function App({ manifest }: AppProps) {
  const { docs, create, update, remove, pending, error } = useAppStorage<Entry>();
  // docs: 自分の文書（新しい順）。{ id, createdAt, updatedAt, data: Entry }
  // create(data) / update(id, data): 成功すると文書、失敗すると null（error に理由が入る）
  // remove(id): 成功すると true（元に戻せない）
}
```

- 文書の data は、JSON にできる値なら何でもよい（オブジェクト、配列、文字列など）。形はアプリが決め、`types.ts` に型を書く
- 1 件は 100 KB まで。利用者 × アプリごとに 1,000 件まで
- `createdAt` / `updatedAt` は ISO 8601 の文字列。表示は `new Date(d.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })` のように、必ず `timeZone` を付ける（サーバーとブラウザで表示が食い違わないように）
- 1 つの利用者が使う設定（並び順の好みなど）も、文書として保存してよい（例: `data: { kind: "settings", ... }`）
- 型: `AppManifest`、`AppDocument<T>`、`AppProps`、`AppAdminProps<T>`、`AppStorage<T>`、`AppSharing`

### お寺との共有（`sharing: true` のアプリだけ）

```tsx
"use client";
import { useAppSharing } from "@/apps-sdk";

export function SharingPanel() {
  const { available, shared, share, unshare, pending, error } = useAppSharing();
  // available: manifest の sharing。shared: 今、共有しているか
  // share() / unshare(): 成功すると true、失敗すると false（error に理由）。帯の表示も同時に変わる
}
```

- 文言やデザインは自由（例: 「住職に見てもらう」「見せるのをやめる」）。ひな形の `SharingPanel.tsx` が例
- **オンにする前に、何が共有されるかを説明する**（上のルール 5）。やめるときは、すぐやめられるようにする
- 変更は、基盤が履歴と監査ログに残す
- `sharing: false` のアプリで `useAppSharing` を使うと、`apps:check` が知らせる

## データの形を変えるとき
すでに保存された文書は、古い形のまま残る。形を変えるときは、data に版（`v: 2` など）を入れ、古い形も読めるように書く。

## 書き方の注意
- 利用者は高齢の方も多い。やさしい言葉で、文字は大きめ（Tailwind の `text-lg` 以上）、ボタンは押しやすく。スマートフォンで見やすくする
- 消す操作の前には確認を出す（`confirm` など）
- グラフや装飾は、ライブラリを使わず `div` と Tailwind で作る
- Admin.tsx には、利用者が保存した内容だけを表示する（推測や評価を足さない）

## 確かめ方
1. `npm run apps:gen`（一覧を作り直す。`npm run dev` を起動したときにも流れる。起動中にアプリを足したときは、手で流す）
2. `npm run apps:check`（規約違反が 0 件）
3. `npm run typecheck` と `npm run lint`
4. `npm run dev` で `/apps` を開き、ニックネームで始めて、作る・直す・消すを試す
5. `sharing: true` なら、アプリの共有のボタン（または帯の「共有の設定」）で共有し、帯の表示が「お寺と共有中」に変わること、管理画面（`/admin/apps`）で Admin.tsx の表示を確かめる。共有をやめると見えなくなることも確かめる
