# 00 基盤

> 段階 0。1 人で直列に作る。ここが終わると、01〜06 を並列で始められる。
> 仕様: spec.md §1（技術スタック、構成）、§4（MCP の決定事項）、§8、§9

## 担当する範囲
- 設定ファイル一式（`package.json`、`drizzle.config.ts`、`docker-compose.yml`、`.env.example`、`CLAUDE.md`）
- `src/domain/core/`、`src/db/`（`schema/index.ts`、`schema/core.ts`、`client.ts`、`seed/index.ts`、`seed/core.ts`）
- `src/mcp/server.ts`、`src/mcp/framework/`
- `src/app/layout.tsx`、`src/app/admin/layout.tsx`（ナビゲーション）、`src/app/login/`、スタッフ認証の middleware
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
- [ ] `git stash apply` で、退避してあるひな形を戻す（`README.md` と `CLAUDE.md` は衝突しうるので、手で合わせる）。起動を確かめてから `git stash drop` する
- [ ] `npm install`、`docker compose up -d`、`npm run dev` で起動を確かめる
- [ ] Next.js のドキュメント（`node_modules/next/dist/docs/`）で、このバージョンの App Router、middleware、Server Actions の書き方を確かめる（`AGENTS.md` の指示）

### ディレクトリとスキーマ
- [ ] README の「並列で作るときの決まり」のディレクトリを作る
- [ ] `src/db/schema.ts` を `src/db/schema/<機能>.ts` に分け、`schema/index.ts` でまとめる。`drizzle.config.ts` の `schema` をディレクトリに向ける
- [ ] スキーマを spec.md §9（v0.6）に合わせる。stash のスキーマは v0.6 より前のもので、次の違いがある
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
- [ ] README の「テーブルの持ち主」の表に合わせて、スキーマのファイルを分ける
- [ ] 施設の予約の重複を DB でも防ぐ（03 のドメイン層のチェックと二重にする）。Drizzle の push では作れないので、`src/db/sql/` の SQL ファイルに書く
  - `CREATE EXTENSION IF NOT EXISTS btree_gist`
  - `EXCLUDE USING gist (facility_id WITH =, tstzrange(start_at, end_at) WITH &&) WHERE (status IN ('pending', 'confirmed'))`
- [ ] `npm run db:push` が通る

### 共通のドメイン層（`src/domain/core/`）
- [ ] `Actor` の型
- [ ] 時間の区間の関数とテスト（重なり、結合、空き時間。日をまたぐ場合、端がちょうど接する場合）
- [ ] お寺の設定の読み込みと型
- [ ] 宗派プリセットの型と読み込み（中身は 01）
- [ ] 監査ログの書き込み

### スタッフの認証と管理画面の枠
- [ ] メールとパスワードでのログイン、ログアウト（パスワードは bcrypt などでハッシュにする）
- [ ] `/admin` 以下をログイン必須にする
- [ ] 管理画面のレイアウトとナビゲーション（台帳、法要、カレンダー、施設、フォーム、ポータルの管理）。各機能は、ナビゲーションに 1 行を追加するだけで済む形にする
- [ ] 大きめの文字の基本スタイル（§8）

### MCP の本体
- [ ] stdio のエントリポイント（`npm run mcp`）。環境変数 `MCP_ACTOR` で操作者のスタッフを決める
- [ ] `defineReadTool` / `defineWriteTool` と、`pending_actions` を使った 2 段階の確認（有効期限は 10 分。期限切れと実行済みの `confirmation_id` は拒否する）
- [ ] `confirm_action` ツール
- [ ] すべての呼び出しを `audit_logs` に残す
- [ ] 各機能の `src/mcp/tools/<機能>.ts` を 1 行で登録できる `server.ts`
- [ ] 確かめるための仮のツール（読み取り 1 つ、書き込み 1 つ）。各機能のツールがそろったら消す
- [ ] Claude Desktop の設定例を README に書く

### シードとテスト
- [ ] `seed/index.ts` から各機能の `seed/<機能>.ts` を順番に呼ぶ仕組み。`npm run db:seed`
- [ ] `seed/core.ts`: お寺（日蓮宗、§9 の設定の初期値）とスタッフ（住職、副住職、執事長は `is_officiant`。奥様、寺務員、アルバイト。ログインできる人とできない人を両方入れる）
- [ ] `npm run db:reset`: DB を空にして、スキーマを反映し（push のあとに `src/db/sql/` を流す）、シードを入れる（何度でも作り直せるようにする）
- [ ] DB の名前を `.env` の `DATABASE_URL` で切り替えられるようにする。指定した DB がなければ作る（worktree ごとに別の DB を使うため。README を参照）
- [ ] テスト用の DB（`<DB の名前>_test`）と、`tests/**/*.test.ts` を実行する `npm test`
- [ ] `npm run typecheck`、`npm run lint` が通る

### 開発のルール
- [ ] `CLAUDE.md` に、ディレクトリの決まりと「自分の機能のディレクトリだけを書き換える」決まりを書く（このファイルと README を指す）

## 決めること
- 日時の扱い: DB は `timestamptz` にし、画面とツールでは Asia/Tokyo で表示する（案）
- `npm run dev` のポートを `.env` で変えられるようにする方法

## 完了の条件
- `npm test`、`npm run typecheck`、`npm run lint` が通る
- `npm run db:reset` で、スキーマとお寺・スタッフのシードが入る
- スタッフがログインして、管理画面の枠が見られる
- Claude Desktop から仮のツールを呼べる。書き込みはプレビューのあと `confirm_action` で実行され、`audit_logs` に残る
