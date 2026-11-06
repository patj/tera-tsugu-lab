---
name: new-care-tool
description: 相談に来る人向けのケアのツール（tools/<tool-id>/ のプラグイン）を、ひな形から作る。「〇〇のツールを作りたい」「〇〇を記録できるようにしたい」「ケアのツールを作って」と言われたときに使う。
---

# ケアのツールを作る

相談に来る人が気持ちを書きとめ、振り返るためのツールを、`tools/_template/` から作る。
作る前に、必ず `tools/CLAUDE.md`（ルール）を読む。手順書は `docs/care-tools-guide.md`。

## 1. 聞き取る（足りないことだけ、まとめて 1 回で聞く）

- だれが、どんなときに使うか（例: 大切な人を亡くした方が、毎晩の気持ちを書く）
- 記録したいこと（3〜6 項目くらい）。それぞれ、段階（scale）、選択肢（choice）、1 行（text）、自由記述（textarea）のどれにするか
- 振り返りの画面で見せたいもの（例: 気持ちの移り変わり、よく選ばれた選択肢）
- ツールの名前と、アイコン（絵文字 1 つ）

相手はプログラミングに詳しくない前提で、やさしい言葉で聞く。決まらないことは、おすすめを示して進めてよい。

## 2. 作る

1. ツールの ID を決める（英小文字・数字・`-`。例: `grief-journal`）。`tools/<id>/` がまだないことを確かめる
2. `cp -r tools/_template tools/<id>`
3. `manifest.ts`: `id` をディレクトリの名前に、`name`、`description`、`icon`、`fields` を書く
   - 自由記述（`text` / `textarea`）は必ず危機検知の対象になる（`crisis: false` を付けない）
   - 「消えたい」のようなつらい言葉を選択肢に含めるときは、その `choice` に `crisis: true` を付ける
4. `schema.ts`: manifest の項目とキーをそろえた `z.object`。必須でない項目は `.optional()`。`scale` は `z.number().int().min().max()`、`choice` は `z.enum([...])`
5. `Entry.tsx`: ふつうは `<CareEntryForm manifest={manifest} action={action}>` に、ひとことの案内を添えるだけでよい
6. `History.tsx` / `AdminView.tsx`: `CareEntryList` を基本に、必要なら記録から作った小さな表示（移り変わりの棒など）を足す。グラフのライブラリは使わず、`div` と Tailwind で作る
7. `README.md`: 目的、だれ向けか、項目

## 3. 守ること（tools/CLAUDE.md の要約）

- import は `@/care-sdk`、`react`、`zod`、自分のディレクトリの中だけ
- データを読み書きしない（DB、cookie、localStorage など）。外部に送信しない（fetch、外部の URL）
- 診断的な表現（「うつ病」「症状」「診断」「治療」など）や、点数で判定する表現を使わない
- `src/` などの本体のファイルは変えない

## 4. 確かめる

```sh
npm run tools:gen
npm run tools:check   # 違反が 0 件になるまで直す
npm run typecheck
npm run lint
```

最後に、相手に次を伝える。
- `npm run dev` のあと、`/care` で試せること（ニックネームで始め、記録 → ふりかえる → 共有の設定）
- 管理画面の「こころのケア」（`/admin/care`）で、共有された記録の見え方を確かめられること
- 自由記述に「消えたい」と書くと、相談窓口が表示されること（危機検知の確認）
- 公開の前に、`npm run tools:check` をもう一度流すこと
