# 00 基盤

> 段階 0。1 人で直列に作る。ここが終わると、01〜06 を並列で始められる。
> 仕様: spec.md §1（技術スタック、構成）、§4（MCP の決定事項）、§8、§9

## 担当する範囲
- 設定ファイル一式（`package.json`、`drizzle.config.ts`、`docker-compose.yml`、`.env.example`、`CLAUDE.md`）
- `src/domain/core/`、`src/db/`（`schema/index.ts`、`schema/core.ts`、`client.ts`、`seed/index.ts`、`seed/core.ts`）
- `src/mcp/server.ts`、`src/mcp/framework/`、`src/mcp/tools/index.ts`、`src/mcp/tools/core.ts`
- `src/app/layout.tsx`、`src/app/admin/layout.tsx`、`src/app/admin/nav.ts`（ナビゲーション）、`src/app/login/`、`src/proxy.ts`（Next.js 16 で middleware から名前が変わった）、`src/lib/`
- `scripts/`（DB の作成、`db:reset`、テストの実行、MCP の設定の出力）
- テストの仕組み（`tests/` の構成、テスト用の DB）

## 依存先
なし

## 提供するインターフェース
ほかのすべての機能が使う。段階 1 に入る前にコミットしておく。

- **操作者**（`Actor`）: `{ channel: "web" | "mcp" | "portal", staffId?, personId?, portalAccountId? }`。ドメイン層の関数は第 1 引数で受け取る（私的な予定の保護やポータルの権限の判定に使う）
- **時間の区間**: `Interval { start: Date; end: Date }`、重なりの判定、区間の結合、区間の一覧から空いている時間を求める関数。日時は Asia/Tokyo で扱う
- **お寺の設定**: `getTempleSettings()` → `memorial_duration_min`、`buffer_min`、`slot_first_start`、`slot_last_start`、`slot_step_min`（§9）
- **宗派プリセット**の読み込み: 用語（法号など）と年忌の一覧。中身は 01 が埋める
- **監査ログ**: `writeAuditLog(actor, { action, target, summary })`
- **トランザクション**: `db.transaction` をそのまま使う。ほかの機能の関数に `tx` を渡せる形にする（04 が 02 と 03 の関数を同じトランザクションで呼ぶため）
- **MCP のツール定義**
  - `defineReadTool({ name, description, input, handler })`
  - `defineWriteTool({ name, description, input, preview, execute })`: 呼ばれるとプレビューと `confirmation_id` を返し、`pending_actions` に保存する。`confirm_action` で `execute` が呼ばれる
  - どちらも、呼び出しをすべて `audit_logs` に残す
- **スタッフのログイン状態**: サーバー側で今の `staffId` を取り出す関数（`getCurrentStaff()`）

## タスク

### ひな形を戻す
- [x] `git stash apply` で、退避してあるひな形を戻す（`README.md` と `CLAUDE.md` は衝突しうるので、手で合わせる）。起動を確かめてから `git stash drop` する
  - stash にあった古い下書き（`src/domain/nenki.ts` など。v0.2 の数え方で一周忌を 1 としていた）は取り込まなかった。stash は消さずに残してある
- [x] `npm install`、`docker compose up -d`、`npm run dev` で起動を確かめる
- [x] Next.js のドキュメント（`node_modules/next/dist/docs/`）で、このバージョンの App Router、middleware、Server Actions の書き方を確かめる（`AGENTS.md` の指示）

### ディレクトリとスキーマ
- [x] README の「並列で作るときの決まり」のディレクトリを作る
- [x] `src/db/schema.ts` を `src/db/schema/<機能>.ts` に分け、`schema/index.ts` でまとめる。`drizzle.config.ts` の `schema` をディレクトリに向ける
- [x] スキーマを spec.md §9（v0.6）に合わせる。stash のスキーマは v0.6 より前のもので、次の違いがある
  - `staff_schedules` → `staff_events`（visibility、owner_staff_id、category、title、body）と `staff_event_assignees` にする
  - `staff`: `email` と `password_hash` を任意にする（ログインしない人がいる）
  - `households`: `contact_person_id`（窓口）を追加する
  - `persons`: `mobile_phone`、`email`、`gender` を追加する
  - `memorial_services`: `seshu_person_id` / `seshu_name`、`travel_before_min`、`travel_after_min` を追加する
  - `reservations`: `reject_reason` を追加する
  - `facilities`: `kind` を消して `position` を追加する
  - `temples.settings`: §9 の項目にする（移動時間の初期値 `travelMin` は持たない。§3）
  - 追加するテーブル: `memorial_requests`、`person_relations`、`portal_accounts`、`portal_invites`、`portal_login_tokens`
  - `form_questions`: `type` に `date` と `person_list` を加え、`max_persons`、`item_fields` を追加する。`profile_field` の値を §5 の項目（氏名、カナ、生年月日、性別、住所、電話、メール）にする
  - `form_responses`: `person_id` を追加し、`source` の値を `portal` / `member_link` / `public` にする
  - `forms.status` の初期値を `draft` にする
  - `audit_logs.channel` の値を `web` / `mcp` / `portal` にする
  - `care_*` のテーブルは外す（§7 は保留中）。`src/care-sdk/` と `tools/` も外す
- [x] README の「テーブルの持ち主」の表に合わせて、スキーマのファイルを分ける
- [x] 施設の予約の重複を DB でも防ぐ（03 のドメイン層のチェックと二重にする）。Drizzle の push では作れないので、`src/db/sql/` の SQL ファイルに書く
  - `CREATE EXTENSION IF NOT EXISTS btree_gist`
  - `EXCLUDE USING gist (facility_id WITH =, tstzrange(start_at, end_at) WITH &&) WHERE (status IN ('pending', 'confirmed'))`
- [x] `npm run db:push` が通る

### 共通のドメイン層（`src/domain/core/`）
- [x] `Actor` の型
- [x] 時間の区間の関数とテスト（重なり、結合、空き時間。日をまたぐ場合、端がちょうど接する場合）
- [x] お寺の設定の読み込みと型
- [x] 宗派プリセットの型と読み込み（中身は 01）
- [x] 監査ログの書き込み

### スタッフの認証と管理画面の枠
- [x] メールとパスワードでのログイン、ログアウト（パスワードは bcrypt などでハッシュにする）
- [x] `/admin` 以下をログイン必須にする
- [x] 管理画面のレイアウトとナビゲーション（台帳、法要、カレンダー、施設、フォーム、ポータルの管理）。各機能は、ナビゲーションに 1 行を追加するだけで済む形にする
- [x] 大きめの文字の基本スタイル（§8）

### MCP の本体
- [x] stdio のエントリポイント（`npm run mcp`）。環境変数 `MCP_ACTOR` で操作者のスタッフを決める
- [x] `defineReadTool` / `defineWriteTool` と、`pending_actions` を使った 2 段階の確認（有効期限は 10 分。期限切れと実行済みの `confirmation_id` は拒否する）
- [x] `confirm_action` ツール
- [x] すべての呼び出しを `audit_logs` に残す
- [x] 各機能の `src/mcp/tools/<機能>.ts` を 1 行で登録できる `server.ts`
- [x] 確かめるための仮のツール（読み取りの `whoami`、書き込みの `debug_write_note`）。`whoami` は残す。`debug_write_note` は各機能の書き込みのツールがそろったら消す（07）
- [x] Claude Desktop の設定例を README に書く
- [x] 名前を LLM に返さない決まり（spec.md §4「LLM に渡す情報」、11/6 の決定）の共通の部品を `src/mcp/framework/present.ts` に足す
  - 家の名前を返してよいかの判定（世帯の名前から「家」を除いた部分が、その呼び出しの引数の文字列に含まれるか）
  - 申請者の名前を伏せる（名前の最初の 1 文字だけを残す。「佐藤 美咲」→「佐○ ○○ 様」）
  - 住所から市（市区町村）までを取り出す（自宅・墓前の法要の場所に使う）
- [x] `tests/core/mcp-privacy.test.ts` を広げる: 故人の俗名と法号、檀家の生きている人の名前、施設の予約の申請者の名前（伏せる前）と件名が、どの結果とプレビューにも入らない。家の名前は、引数に含まれていない呼び出しの結果に入らない（一覧のあとに ID で呼ぶ場合を含める）

### シードとテスト
- [x] `seed/index.ts` から各機能の `seed/<機能>.ts` を順番に呼ぶ仕組み。`npm run db:seed`
- [x] `seed/core.ts`: お寺（日蓮宗、§9 の設定の初期値）とスタッフ（住職、副住職、執事長は `is_officiant`。奥様、寺務員、アルバイト。ログインできる人とできない人を両方入れる）
- [x] `npm run db:reset`: DB を空にして、スキーマを反映し（push のあとに `src/db/sql/` を流す）、シードを入れる（何度でも作り直せるようにする）
- [x] DB の名前を `.env` の `DATABASE_URL` で切り替えられるようにする。指定した DB がなければ作る（worktree ごとに別の DB を使うため。README を参照）
- [x] テスト用の DB（`<DB の名前>_test`）と、`tests/**/*.test.ts` を実行する `npm test`
- [x] `npm run typecheck`、`npm run lint` が通る

### 開発のルール
- [x] `CLAUDE.md` に、ディレクトリの決まりと「自分の機能のディレクトリだけを書き換える」決まりを書く（このファイルと README を指す）

## 決めたこと
- 日時の扱い: DB は `timestamptz` にし、画面とツールでは日本時間で扱う。日本には夏時間がないので +09:00 の固定で計算する（`src/domain/core/time.ts`）
- テスト用の DB: 同じ Postgres の中に `<DB の名前>_test` を作る。`npm test` が毎回作り直す。テストのファイルは 1 つずつ順に流す
- `npm run dev` のポート: `npm run dev -- -p 3001` で変える
- Next.js の Cache Components は使わない（DB を読む画面を素直に書けるようにするため）
- パスワードは scrypt でハッシュにする。ログインの状態は HMAC で署名した cookie（7 日間）
- MCP のツールの登録は `src/mcp/tools/index.ts` にまとめる（`server.ts` は起動だけ）
- Claude Desktop の設定は `npm run mcp:config` で出力する（Claude Desktop は PATH が短く、作業ディレクトリも決まっていないので、node、tsx、tsconfig を絶対パスで書く）
- `audit_logs` に `result`（ok / needs_confirmation / error: ...）の列を足した（spec.md §4 の「結果」を残すため）
- `staff` に `kana` と `position`（表示順）、`staff_events` に `cancelled_at` の列を足した

## 確認の結果
- 2026-11-06: Claude Desktop から `whoami`、`debug_write_note` のプレビューと `confirm_action`、同じ確認の 2 回目の拒否を確かめた（ユーザー）
- `whoami` で `is_officiant` が「導師」と表現されたので、MCP の出力と説明文では「法要の担当者」と呼ぶようにした（サーバーの instructions、`whoami` の出力、CLAUDE.md）

## 完了の条件
- `npm test`、`npm run typecheck`、`npm run lint` が通る
- `npm run db:reset` で、スキーマとお寺・スタッフのシードが入る
- スタッフがログインして、管理画面の枠が見られる
- Claude Desktop から仮のツールを呼べる。書き込みはプレビューのあと `confirm_action` で実行され、`audit_logs` に残る
