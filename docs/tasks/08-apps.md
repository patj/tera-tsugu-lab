# 08 お寺のアプリの基盤

> 段階 4（基本機能のあと）。デモの台本（§11）には、まだ入れていない。
> 仕様: spec.md §7、§8、§9
> 範囲: 基盤と、アプリを作る人向けのドキュメントだけ。アプリそのもの（日記、占いなど）は作らない。

## 経緯
- 11/6 に「メンタルケアのフレームワーク」として一度実装した（コミット 18c87a4〜6d4adaf。`care`、`tools/`、項目の定義、危機検知、相談窓口、アラート）
- 同じ日に、用途を決めない「お寺のアプリ」の基盤に仕様を改めた（spec.md §13 の 11/6 の最後の行）。下のタスクで作り直す
- そのまま使えるもの: 匿名の利用者と cookie、共有の同意（履歴、最後の行）、暗号化、監査ログ、MCP の拒否、一覧の生成と規約のチェックのスクリプト、管理画面の骨組み

## 担当する範囲
- `src/db/schema/apps.ts`
- `src/domain/apps/`（ドメイン層。Web だけから呼ぶ。MCP の操作者は拒否する）
- `src/apps-sdk/`（アプリが import できる唯一の窓口。DB に依存しない）
- `src/app/apps/`（利用者の画面と、文書の読み書きの API）、`src/app/admin/apps/`（管理画面）
- `apps/`（ひな形、`apps/CLAUDE.md`）、`.claude/skills/new-temple-app/`、`docs/apps-guide.md`
- `scripts/apps.ts`（`npm run apps:gen` / `npm run apps:check`）
- `tests/apps/`
- 基盤への小さな変更: `src/domain/core/actor.ts` の操作者のチャンネル（`care` → `apps`）

## タスク

### 改める前の実装を片づける
- [x] `care` の名前を `apps` に変える（テーブル、ドメイン層、SDK、画面、cookie、環境変数、スクリプト、npm のスクリプト、テスト）
- [x] 危機検知、相談窓口、注意書き、アラート（`care_alerts`）、項目の定義（fields、schema）と、決まった形のフォームを消す
- [x] 開発用の DB の古いテーブル（`care_*`）を消す

### データと安全の仕組み
- [x] テーブル（`app_users`、`app_documents`、`app_consents`）。すべてに `temple_id`
- [x] 文書の保存（自由形式の JSON。作る、一覧、更新、削除）。暗号化（鍵は `APPS_ENCRYPTION_KEY`）。上限（1 件 100 KB、利用者 × アプリごとに 1,000 件）
- [x] 共有の設定（`sharing: true` のアプリだけ。履歴、監査ログ）
- [x] スタッフ向け: 共有している利用者の一覧、共有された文書（開くたびに監査ログ）
- [x] すべての関数で、MCP の操作者を拒否する

### アプリの仕組み
- [x] `@/apps-sdk`: `defineAppManifest`、`useAppStorage<T>()`、`AppAdminProps<T>` などの型
- [x] 文書の読み書きの API（`/apps/api/<app-id>/docs`。cookie の利用者だけ。同じオリジンからだけ）
- [x] `npm run apps:gen`（`predev`、`prebuild`）、`npm run apps:check`（必要なファイル、import の許可リスト、外部への送信など、manifest の id、一覧が最新か）
- [x] ひな形（`apps/_template/`）、`apps/CLAUDE.md`、skill（`.claude/skills/new-temple-app/`）、手順書（`docs/apps-guide.md`）

### 画面
- [x] 利用者: はじめの画面（ニックネーム。端末を変えると戻れないことを明示）、アプリの一覧、アプリの画面（基盤の帯と共有の設定へのリンク）、共有の設定
- [x] スタッフ: アプリの一覧、共有している利用者の一覧、共有された文書（アプリの Admin.tsx）

### 開発キット（お寺に渡すもの）
- [x] `kit/`: 試す画面（Vite）、キット版の SDK（保存先はブラウザの中。上限とエラーの文は本体と同じ）、`apps:check`、`README.md`、`CLAUDE.md`、skill
- [x] `npm run kit:build`: 本体から型、決まりのチェック、ひな形、決まりをコピーして `dist/temple-app-kit.zip` を作る
- [x] テスト（`tests/apps/kit.test.ts`）: コピーが本体と同じ、SDK の export が同じ、キットのひな形がチェックを通る
- [x] 確認: zip を空のディレクトリに展開し、`npm install`、`apps:check`、`typecheck`、`vite build`、違反の検出、ヘッドレスのブラウザで試す画面の操作（保存 → 読み直し → 共有 → スタッフの画面 → 消す → 共有をやめる）

### テスト
- [x] 暗号化（往復、改ざん、付け替え）、文書の読み書きと上限、共有（共有 → やめるとすぐに見えない、共有し直すと過去の文書も見える）、他人の文書に触れない、MCP の拒否、監査ログ（本文とニックネームを残さない）、DB に平文が残らない、`apps:check`

### 基盤を広げる（11/6。spec.md §7「アプリが使える能力」）
先方（Heart Closet）がアプリを作れるよう、まず開発キットを作り直して渡す。先方のアプリの開発には、こちらは手を出さない。

開発キット（先に渡す）
- [x] 型（`types.ts`）: manifest の `display` / `pwa` / `storage` / `ai`、AI の仕事（`defineAppAI`）、`useAppAI` / `useAppAssets` の結果、`removeAll`、上限の定数、同意の版
- [x] AI の処理の共通部分（`src/apps-sdk/ai-server.ts`、`ai-schema.ts`、`ai-client.tsx`、`image.ts`）: 仕事と入力からリクエストを組み立て、公式の SDK（`@anthropic-ai/sdk`）で呼び、返事を zod で確かめる。クライアントを差し替えられる。キットにもコピーする
- [x] キットの SDK: `useAppAI`（基盤の同意の画面、画像を縮める）、`useAppAssets`、`removeAll`、件数の上限
- [x] キットの試す画面: AI の中継（`preview/ai-middleware.ts`。キーは `.env` の `ANTHROPIC_API_KEY`）、素材の配信、全画面の表示（右上のボタン）、スマホの幅、AI の同意をやめる
- [x] `apps:check`: manifest の新しい値、`ai.ts` の import と返事の形、素材の種類と大きさ（SVG は不可）、CSS Modules、SVG の名前空間の URL、`useAppAI` と manifest の `ai` の食い違い
- [x] ひな形、`apps/CLAUDE.md`、キットの README / CLAUDE.md / skill、本体の skill と手順書を新しい能力に合わせる
- [x] zip に `.env` が入らないこと。空のディレクトリに展開して、install、check、typecheck、build。AI のアプリを作り、偽の Anthropic API（`ANTHROPIC_BASE_URL`）で、ヘッドレスのブラウザから同意 → 呼び出し → 結果、画像の縮小、素材、すべて消す、同意をやめる、を確かめた

本体（受け取ったアプリを組み込む前に必要）
- [x] SDK のフック: `useAppAssets`、`removeAll`（と `DELETE /apps/api/<app-id>/docs`）。`useAppAI`（下の AI の中継を呼ぶ）
- [x] 素材を `public/app-assets/` に写して配信する（`apps:gen`。git の管理外）
- [x] 件数の上限を manifest で変えられるようにする
- [x] AI の中継: `/apps/api/<app-id>/ai/<仕事>` と `ai-consent`、同意（版つき。`app_ai_consents`）と使用の記録（`app_ai_usage`）、アプリごとの月の費用の上限、利用者ごとの 1 日と全体の 1 分あたりの回数の上限、運用者の `ANTHROPIC_API_KEY`。帯に同意の状態と「やめる」。管理画面に今月の回数と費用
- [x] 全画面の表示（右上の小さなボタンとメニュー）、アプリごとの Web App Manifest（`/apps/<app-id>/manifest.webmanifest`、テーマの色、iPhone 向けの設定）、はじめる画面から元のアプリへ戻る
- [ ] 引き継ぎコード
- [x] 利用者の画面の下の説明を変える（AI を使うアプリでは、同意したときだけ送ることを書く。今はすべての画面で同じ文）

### 1 件ずつの共有（11/6。spec.md §7「1 件ずつの共有」）
アプリを作る人からの要望（日記なら日付ごとに見せたい）。アプリ単位の共有の中で、文書ごとに共有の印を付ける 2 段にする。新しい文書は共有しない。

データとドメイン層
- [x] `app_documents.shared`（boolean、初期値 false）
- [x] 型: manifest の `sharing` を `boolean | "perDoc"` にする。文書に `shared` を足す。`sharing` を `true` と比べているところを見直す
- [x] 文書を作るときに印を付けられる（`"perDoc"` のアプリだけ。ほかは `invalid`）。`update` は印を変えない
- [x] 印を変える関数（`"perDoc"` のアプリだけ。本人の文書だけ。監査ログに文書の ID と付けたか外したか。本文とニックネームは残さない）
- [x] スタッフの閲覧: `"perDoc"` のアプリでは、アプリ単位で共有中で、かつ印の付いた文書だけを復号して渡す。監査ログの件数も渡した件数にする。利用者の一覧に見える文書の件数を出す（印が 0 件の利用者も、共有中なら一覧に出す）
- [x] MCP の操作者を拒否する（ほかの関数と同じ）

SDK と API
- [x] `POST /apps/api/<app-id>/docs` で `shared` を受け取る。`PUT /apps/api/<app-id>/docs/<doc-id>/sharing`（`{ shared }`）
- [x] `useAppStorage`: `create(data, { shared })`、`setShared(id, shared)`（失敗すると `false`、`error` に理由）、`docs` の `shared`
- [ ] `apps:check`: `sharing` の値（`false` / `true` / `"perDoc"`）、`"perDoc"` でも Admin.tsx が必要、`"perDoc"` でないアプリで `setShared` や `create` の `shared` を使ったら知らせる

画面
- [x] 帯と全画面の右上のメニュー: `"perDoc"` で共有中なら「お寺と共有中（選んだものだけ）」
- [x] 共有の設定の画面（`/apps/<app-id>/sharing`）: `"perDoc"` では、選んだものだけが見えることと、印の付いた件数を出す
- [x] 管理画面: 利用者の一覧に見える文書の件数

開発キットとドキュメント
- [ ] キットの SDK（`kit/sdk/storage.tsx`）と試す画面: 印、`setShared`、スタッフの画面には印の付いた文書だけ。上限とエラーの文は本体と同じ
- [ ] `apps/CLAUDE.md`（ルール 5 に 1 件ずつの共有の説明、`useAppStorage` の例、manifest の `sharing`）、ひな形、本体とキットの skill、`docs/apps-guide.md`（能力の表、確かめ方、公開の前のチェックリスト）、キットの README / CLAUDE.md

テストと確認
- [ ] テスト: 新しい文書は共有しない、印を付けた文書だけがスタッフに渡る（復号もしない）、アプリ単位でやめると印があっても見えない、共有し直すと印の付いた過去の文書が見える、`update` で印が変わらない、他人の文書の印は変えられない、`sharing: true` のアプリで印を使うとエラー、監査ログ（本文とニックネームなし）、MCP の拒否、`apps:check`、キットの SDK の export が本体と同じ
- [ ] 確認: 一時的な `"perDoc"` のアプリで、作る → 印を付ける → 共有 → 管理画面で印の付いた文書だけ見える → 印を外す → 見えない → アプリ単位でやめる → 見えない（一時的なアプリとデータは消す）

## 決めたこと
- spec.md §7 のとおり（能力は個人の保存とお寺との共有だけ、利用者は匿名だけ、アプリはリポジトリの中の React）
- コードの名前: アプリは `apps/<app-id>/`、ドメイン層は `src/domain/apps/`、SDK は `src/apps-sdk/`、テーブルは `app_*`、利用者の画面は `/apps`、cookie は `tera_apps`（パス `/apps`）

- 文書の読み書きの API は Route Handler（`/apps/api/<app-id>/docs`）にした。`useAppStorage` がブラウザから呼ぶので、Server Actions よりも、メソッド（GET / POST / PUT / DELETE）と状態コードで分かりやすく書けるため。同じオリジンからの JSON だけを受け付ける（ほかのサイトのフォームからは送れない）。アプリの ID に `api` は使えない（`apps:check` で確かめる）
- `useAppStorage` の `create` / `update` / `remove` は、失敗しても例外を投げず、`null` / `false` を返して `error` に理由を入れる（Claude Code が作るアプリで、例外の扱いを忘れても画面が壊れないように）
- 文書の状態は `AppStorageProvider`（本体のページが置く）が持つ。同じ画面の中で `useAppStorage` を何度呼んでも、同じ文書を見る
- アプリが共有に対応しなくなったら（manifest の `sharing` を false にしたら）、以前の共有の設定が残っていても、スタッフには見せない
- 確認: テスト（tests/apps/）に加えて、起動中の開発サーバーで、ひな形をコピーした一時的なアプリを使い、はじめる → 作る・直す・消す → 他人からは触れない → 共有 → 管理画面で見える → やめると見えない、を確かめた（一時的なアプリとデータは消した）。ブラウザの JavaScript（useAppStorage）での操作は、まだ実機で確かめていない
- シードにアプリのデータは入れない（アプリを同梱しないため）
- 共有の操作はアプリが自由に作れる（`useAppSharing`、`/apps/api/<app-id>/sharing`）。基盤は履歴と監査ログ、帯の状態とリンクだけを守る。オンにする前の説明はアプリの責任（spec.md §7、11/6 の決定ログ）。帯の状態はクライアントの部品（`SharingStatus`）にし、アプリが共有を変えると同時に変わる。`sharing: false` のアプリで `useAppSharing` を使うと `apps:check` が知らせる

- 開発キットの案内書は、ファイル名を `README.md` にした（日本語のファイル名は、zip を Windows で展開すると文字化けするおそれがあるため）。見出しを「はじめにお読みください」にする

- AI の返事の形は、SDK の `zodOutputFormat` を使わず、`z.toJSONSchema` から作る（`zodOutputFormat` は enum まで説明に移すため。SDK 1.6.0 で確かめた）。長さや範囲は説明に移し、基盤が zod で確かめる
- Opus 5.5 / Sonnet 5.5 は server-side fallback（`fallbacks: "default"`、`server-side-fallback-2026-07-01`）を付ける。Haiku 5.5 は付けない。thinking と temperature は送らず、effort を必ず送る（初期値 low）
- 本物の Claude API で 1 回確かめた（11/6、運用者の承認を得て。`dist/real-api-check.ts`）: Sonnet 5.5 に、構造化出力（enum を含む）、effort: low、`fallbacks: "default"` とその beta ヘッダー、画像（PNG）、SDK の認証の形で送り、成功した（入力 604 / 出力 61 トークン、約 $0.0018）。返事は zod の確かめも通った。Opus 5.5 と Haiku 5.5、キットの試す画面からの本物の呼び出しは、まだ確かめていない
- キットの AI の中継は `preview/ai-middleware.ts` を Vite の `ssrLoadModule` で読み込む（`vite.config.mts` から sdk/ を直接 import すると、Vite の設定の読み込み方の注意が出るため）

- AI の中継の上限は、呼ぶ前に `app_ai_usage` に pending の行を入れて数える。数えてから入れるまでを、お寺ごとの advisory lock で 1 つずつにする（同時に呼ばれても上限を超えない。テストで確かめた）。入力が正しくないものは数えない。費用は返ってきたトークン数と料金表（`ai-server.ts`）からのおおよその額（100 万分の 1 米ドル）
- 同意の API は、利用者に見せた説明の版を受け取り、今の説明と違えば同意を受け付けない（古い画面のまま同意させない）
- 上限の設定は環境変数（`APPS_AI_MONTHLY_BUDGET_USD`、`APPS_AI_BUDGETS_USD`、`APPS_AI_GLOBAL_PER_MINUTE`）。管理画面で変える仕組みはハッカソン後
- 確認: テスト（`tests/apps/ai-relay.test.ts`。Claude は差し替え）と、起動中の本体の画面で、同意 → 記録 → 読み直しても同意、サーバーでの入力の確かめ、帯の「やめる」、監査ログ。本体の画面から本物の Claude は呼んでいない（中の処理は 11/6 に本物の API で確かめたものと同じ）

- お寺の画面の枠（ヘッダーと下の説明）は `/apps` のレイアウトから外し、`FramedShell` として各ページが出す（全画面のアプリだけ枠を出さないため）
- 確かめる中で、本体では `apps/` と `src/apps-sdk/` の Tailwind のクラス（AI の同意の画面を含む）が作られていなかったこと、Turbopack の設定（`*.css` に Tailwind の処理をかけ `as: "*.css"` にしていた）のせいでアプリの `*.module.css` が CSS Modules にならなかったことがわかり、直した（`globals.css` の `@source`、`next.config.ts` の対象を `globals.css` だけに）
- 確認: テスト（`tests/apps/pwa.test.ts`）と、本番のビルド（`next build` → `next start`）をヘッドレスのブラウザで: はじめる前に開く → はじめる → 元のアプリへ、全画面（枠なし）、右上のボタンの位置とメニュー、manifest とアイコン、テーマの色と iPhone 向けの設定、共有の設定の画面、共有中の印、CSS Modules と Tailwind のクラスが効くこと。実際の iPhone / Android でのホーム画面への追加は、まだ試していない
- 起動中の開発サーバーは、ファイルを何度も入れ替えると古いモジュールを持ち続けることがあった（route handler が古い一覧や型を読む、CSS が読み込まれない）。おかしいときは `npm run dev` を起動し直す

## 残っていること
- 最初のアプリを作り、ブラウザで useAppStorage の操作を確かめる（`docs/apps-guide.md` の手順で）
- デモの台本に入れるかどうか（§11）

## 依頼
- なし
