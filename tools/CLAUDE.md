# ケアのツール（tools/）を作るときのルール

このディレクトリには、相談に来る人が使う「ケアのツール」（プラグイン）を置く。1 つのツールが 1 つのディレクトリ（`tools/<tool-id>/`）。
人向けの手順書は [docs/care-tools-guide.md](../docs/care-tools-guide.md)、仕様は [docs/spec.md](../docs/spec.md) §7。

ツールで扱う記録は、健康に関する情報（**要配慮個人情報**）として扱う。安全の仕組み（同意、暗号化、監査ログ、危機検知、相談窓口の表示）は本体が受け持つので、ツールの側では次のルールを必ず守る。

## 絶対に守ること

1. **データを読み書きしない**。DB、ファイル、cookie、`localStorage` などに触らない。記録の保存も読み出しも本体が行い、ツールの画面には props で渡す
2. **import できるのは `@/care-sdk`、`react`、`zod`、自分のディレクトリの中のファイルだけ**。`@/db`、`@/domain`、`@/lib`、`next/*`、`node:*`、npm のパッケージは使わない
3. **外部に送信しない**。`fetch`、`XMLHttpRequest`、`WebSocket`、外部の URL（画像、フォント、リンクを含む）を使わない
4. **診断的な表現をしない**。「うつ病」「症状」「診断」「治療」「重症」などの言葉、点数で状態を判定する表現（「あなたは〇〇の傾向があります」）を使わない。ツールは気持ちを書きとめて振り返るためのもの
5. **自由記述の項目（`text` / `textarea`）は、危機検知の対象から外さない**（`crisis: false` を付けない。付けても本体は検知する）。選択肢（`choice`）に「消えたい」のような言葉を含めるときは `crisis: true` を付ける
6. `process.env`、`eval`、`"use server"`、`dangerouslySetInnerHTML`、`<script>`、`<iframe>` を使わない
7. 作ったら、必ず `npm run tools:gen` と `npm run tools:check` を流し、違反を 0 にする

## ファイルの構成

`tools/_template/` をコピーして作る（`_` で始まるディレクトリは一覧に載らない）。

| ファイル | 内容 |
|---|---|
| `manifest.ts` | `export const manifest = defineCareManifest({ id, name, description, icon, fields })`。`id` はディレクトリの名前と同じにする（英小文字・数字・`-`） |
| `schema.ts` | `export const schema = z.object({...})`。キーは manifest の項目の `id` とそろえる。本体が保存の前に検証する |
| `Entry.tsx` | 記録する画面。`export default function Entry({ manifest, action }: CareEntryProps)`。`action` は `<CareEntryForm action={action}>`（または `<form action={action}>`）にそのまま渡す |
| `History.tsx` | 本人が振り返る画面。`CareHistoryProps<Entry>`（`entries` は新しい順） |
| `AdminView.tsx` | お寺の方が見る画面（本人が共有したときだけ表示される）。`CareAdminViewProps<Entry>` |
| `README.md` | 目的、項目、だれ向けか |

画面のファイルは、サーバーコンポーネントとして書く（`"use client"` は付けない。フックを使う部品が必要なら、そのファイルだけ `"use client"` にしてよいが、その場合も上のルールは同じ）。

## 項目（fields）の型

| type | 入力 | 値の型 | 主な設定 | 危機検知 |
|---|---|---|---|---|
| `text` | 1 行 | string | `maxLength`（初期値 200）、`placeholder` | 必ず対象 |
| `textarea` | 複数行 | string | `maxLength`（初期値 4000）、`rows` | 必ず対象 |
| `scale` | 段階のボタン | number | `min`、`max`、`labels`（例 `{ 1: "とてもつらい", 5: "とてもよい" }`） | 対象外 |
| `choice` | 選択肢から 1 つ | string（`value`） | `options: [{ value, label }]`、`crisis` | `crisis: true` のとき対象 |

共通: `id`（英小文字・数字・`_`）、`label`、`help`（説明）、`required`。
空の項目は保存されない（`undefined`）。schema では、必須でない項目に `.optional()` を付ける。

## `@/care-sdk` で使えるもの

- 型: `CareEntryProps`、`CareHistoryProps<T>`、`CareAdminViewProps<T>`、`CareEntryView<T>`（`{ id, createdAt, crisis, data }`）、`CareManifest`、`CareField`
- `defineCareManifest(manifest)`
- `<CareEntryForm manifest action submitLabel?>`: manifest の項目からフォームを作る。子要素はフォームの先頭に出る
- `<CareEntryList manifest entries showCrisis?>`: 記録を項目ごとに並べる
- `formatCareValue(field, value)`、`formatCareDate(date)`
- `<CrisisResources emphasis?>`、`<CareDisclaimer>`（本体の画面がすでに出しているので、ツールの中で出す必要はない）

## 書き方の注意

- 文章はやさしい言葉で、短く。高齢の方も使うので、文字は大きめ（Tailwind の `text-lg` 以上を基本にする）。スマートフォンで見やすくする
- 相談者を評価・判定しない。「〜できていますね」「〜しましょう」のような指示も控えめにし、受けとめる言葉にする
- 画面の色やグラフは、記録（`entries`）から作る。グラフはライブラリを使わず、`div` と Tailwind で作る
- 管理者向けの画面（AdminView）にも、診断的な表現を出さない。見守りのための表示にとどめる
- 本体（`src/`）のファイルは変えない。本体に機能が足りないときは、ツールの中で無理をせず、その旨を伝える

## 確かめ方

1. `npm run tools:gen`（一覧を作り直す。`npm run dev` でも自動で流れる）
2. `npm run tools:check`（規約違反が 0 件になること）
3. `npm run typecheck` と `npm run lint`
4. `npm run dev` で `/care` を開き、ニックネームで始めて、記録 → 振り返り → 共有の設定を試す。管理画面（`/admin/care`）で、共有した記録が AdminView で見えることを確かめる
5. 自由記述に「消えたい」と書いて保存し、相談窓口が表示されることを確かめる
