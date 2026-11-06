---
name: new-temple-app
description: 「お寺のアプリ」（apps/<app-id>/。日記、占い、写経の記録など、お寺が欲しい小さな機能）を、ひな形から作る。「〇〇のアプリを作りたい」「〇〇できる機能がほしい」「お寺のアプリを作って」と言われたときに使う。
---

# お寺のアプリを作る（開発キット）

`apps/_template/` から、お寺のアプリを作る。作る前に、必ず `apps/CLAUDE.md`（決まり）と、キットの `CLAUDE.md`（キットでの読み替え）を読む。

## 1. 聞き取る（足りないことだけ、まとめて 1 回で聞く）

- だれが、どんなときに使うか
- 利用者が画面でできること（書く、選ぶ、引く、振り返る など）
- 保存するもの（1 件の文書に何を入れるか）。保存がいらないアプリもある（その場合も、履歴を残すかを聞く）
- お寺と共有できるようにするか（`sharing`）。共有するなら、アプリ単位（`true`）か、1 件ずつ選んで見せるか（`"perDoc"`。日記なら日ごとに見せたいときなど）。する場合、共有のボタンの言い方と、お寺の方の画面で何を見せるか
- AI を使うか。使うなら、何を送って（文字、写真）、何を返してほしいか（選択肢、名前、ひとこと など）。AI が失敗したときにどうするか（辞書で選ぶ、定型文など）
- 見た目（お寺の画面の中か、画面全体を使うか）、素材（画像や音）があるか、ホーム画面に追加して使うか
- アプリの名前と、アイコン（絵文字 1 つ）

相手はプログラミングに詳しくない前提で、やさしい言葉で聞く。決まらないことは、おすすめを示して進めてよい。
キットにない機能（お寺に送る、お寺が内容を編集する、檀家としてログインする、オフライン、プッシュ通知、AI の画像生成、課金、外部のサービスを使う など）が必要なら、今はできないことを伝え、できる範囲の案を出す。

## 2. 作る

1. アプリの ID を決める（英小文字・数字・`-`。`api` は使えない。例: `shakyo-log`）。`apps/<id>/` がまだないことを確かめる
2. `apps/_template` を `apps/<id>` にコピーする
3. `manifest.ts`: `id` をディレクトリの名前に、`name`、`description`、`icon`、`sharing` を書く。必要なら `display`、`pwa`、`storage`、`ai` も（`apps/CLAUDE.md` の「manifest」）
4. `types.ts`: 文書の data の型を書く
5. `App.tsx`: 利用者の画面（`"use client"`）。`useAppStorage<型>()` の `docs` / `create` / `update` / `remove` で読み書きする。`error` を画面に出す。日時は `timeZone: "Asia/Tokyo"` を付けて表示する
6. `Admin.tsx`: `sharing` が `true` か `"perDoc"` のとき（`"perDoc"` では、選ばれた文書だけが届く）。共有された文書を表示するだけ。`sharing: false` なら消す
7. `SharingPanel.tsx`: `sharing` が `true` か `"perDoc"` のとき、共有のボタンをアプリに合った文言とデザインにする（`useAppSharing`）。**オンにする前に、何が共有されるかを必ず説明する**。`"perDoc"` なら、文書ごとに「お寺の方に見せる / やめる」の操作と、見せている印を作る（`useAppStorage` の `setShared`。`apps/CLAUDE.md` の「1 件ずつの共有」）。いらなければ App.tsx から外して消してよい。`sharing: false` なら消す
8. AI を使うなら `ai.ts`: `defineAppAI` で仕事を宣言する（指示は固定の文、返事の形は `z.object`、選択肢は `z.enum`）。App.tsx では `useAppAI<typeof ai>()` の `run()` を使い、失敗のすべての種類で止まらないようにする
9. 素材があれば `assets/` に置き、`useAppAssets()` の `url()` / `dataUrl()` で使う（SVG は不可。1 ファイル 2 MB まで）。アプリ専用の CSS は `*.module.css`
10. `README.md`: 目的、だれ向けか、文書の形、画面、共有や AI を使うか

## 3. 守ること（apps/CLAUDE.md の要約）

- import は `@/apps-sdk`、`react`、`zod`、自分のディレクトリの中だけ
- データは `useAppStorage` だけで読み書きする（localStorage、cookie などに触らない）。外部に送信しない（fetch、外部の URL）
- 共有をオンにする前に、何が共有されるかを本人に説明する
- AI の指示に利用者の入力を混ぜない。`ai.ts` は zod と `@/apps-sdk` だけを import する
- 素の HTML / JavaScript のアプリを移すときは、React（TSX）に書き直し、`localStorage` は `useAppStorage`、Claude の直接の呼び出しは `useAppAI`、画像の `fetch` は `useAppAssets().dataUrl()` に置き換える
- `sdk/`、`preview/`、`scripts/`、`apps/_template/` は変えない

## 4. 確かめる

```sh
npm run apps:check   # 違反が 0 件になるまで直す
npm run typecheck
```

最後に、相手に次を伝える。
- `npm run dev` の試す画面（http://localhost:5173）で、作ったアプリを選んで試せること（書く・直す・消す、読み直しても残る）
- `sharing` が `true` か `"perDoc"` なら、共有してから「スタッフの画面」に切り替えると、お寺の方の見え方を確かめられること（`"perDoc"` では、印を付けた文書だけが出る）
- AI を使うなら、キットの `.env` に `ANTHROPIC_API_KEY` を入れてから `npm run dev` をやり直すこと。同意しないときや失敗したときもアプリが止まらないかを試すこと
- できたら `apps/<id>/` を zip にして送ること（`README.md` の「5. 送る」）
