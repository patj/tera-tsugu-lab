# tera-tsugu-lab

お寺の業務を支援する Web アプリ（ハッカソン作品）。仕様は `docs/spec.md` を正とする。実装のタスクは `docs/tasks/` にある。

@AGENTS.md

## 作業ルール
- **このリポジトリを試すだけの人（チームのメンバー）から、準備、起動、最新にすることを頼まれたら、`docs/team-setup.md` の「Claude Code が読むところ」に従う**。その場合は、ファイルを変えず、コミットもしない（以下の作業ルールは開発者のためのもの）。メンバーがお寺のアプリを作るときは、`apps/CLAUDE.md` に従い、書くのは `apps/<app-id>/` の中だけにする
- **区切りのよいところで、適宜 git にコミットする**（機能ごと、または動作確認が取れた単位で）。コミットメッセージは日本語で書く
- 仕様を変える決定をしたら、`docs/spec.md` の決定事項と決定ログ（§13）を更新する
- 完了したタスクは `docs/tasks/<機能>.md` で `[x]` にし、実装と同じコミットに含める
- お寺のアプリの基盤（§7）は `docs/tasks/08-apps.md`。利用者のデータは要配慮個人情報を含みうる: MCP のツールから触らない（ドメイン層も MCP の操作者を拒否する）、本文を監査ログやエラー、`console` に出さない
- お寺のアプリ（`apps/<app-id>/`）を作るときは `apps/CLAUDE.md` に従い、`npm run apps:check` を通す（手順書は `docs/apps-guide.md`）

## ディレクトリと機能の分け方（並列で実装するための決まり）
詳しくは `docs/tasks/README.md` を参照。
- ソースは機能ごとに分ける: `src/domain/<機能>/`、`src/db/schema/<機能>.ts`、`src/db/seed/<機能>.ts`、`src/mcp/tools/<機能>.ts`、`src/app/admin/<機能>/`、`tests/<機能>/`
- **書き換えてよいのは、自分の機能のディレクトリとファイルだけ**。ほかの機能は、その機能が export する関数を呼ぶだけにする
- 共有のファイル（`src/db/schema/index.ts`、`src/db/seed/index.ts`、`src/mcp/tools/index.ts`、`src/app/admin/nav.ts`、`package.json`）には行を追記するだけにする
- テーブルの持ち主は機能ごとに 1 つ（`docs/tasks/README.md` の表）

## コードの決まり
- **ドメイン層**（`src/domain/`）に業務ロジックを置き、Web（Server Actions / Server Components）と MCP の両方から呼ぶ。画面や MCP のツールにロジックを書かない
- ドメイン層の関数は第 1 引数に操作者（`Actor`。`src/domain/core/actor.ts`）を受け取る。権限や私的な予定の保護は、ドメイン層で判定する
- 利用者に見せるエラーは `DomainError`（`invalid` / `notFound` / `forbidden` / `conflict`）で投げる。メッセージは日本語で書く
- ほかの機能と同じトランザクションで書き込む関数は、引数に `tx`（`DbOrTx`）を受け取る
- 日時は DB では `timestamptz`。画面と MCP では日本時間で扱う（`src/domain/core/time.ts` の `jst`、`formatJst`、`parseJstDateTime` など）
- MCP のツールは `defineReadTool` / `defineWriteTool`（`src/mcp/framework/define.ts`）で定義する。書き込みは必ず `defineWriteTool` にする（2 段階の確認と監査ログは仕組みが受け持つ）
- 書き込みのツールの `execute` は、すべての書き込みを 1 つの `db.transaction` の中で行う（失敗したときは同じ `confirmation_id` で再実行できるので、途中まで書き込むと重複する）
- MCP のサーバーでは `console.log` を使わない（標準出力は通信に使う）
- MCP のツールの出力と説明文では、仕様の用語を使う: `is_officiant` は「法要の担当者」（「導師」とは言わない）、戒名は「法号」、あわせて営む年忌は「複数霊位供養」
- Next.js は 16。Cache Components は使わない。middleware は `src/proxy.ts`（名前が proxy に変わった）。書き方に迷ったら `node_modules/next/dist/docs/` を読む
- 管理画面のページでは `getCurrentStaff()` / `getStaffActor()`（`src/lib/staff-auth.ts`）でログインしているスタッフを取る

## 開発環境
- `docker compose up -d`: PostgreSQL を起動する
- `cp .env.example .env`: 環境変数を用意する（worktree では `DATABASE_URL` の DB の名前を `tera_<機能>` に変える）
- `npm run db:reset`: DB を作り直す（DB の作成、スキーマ、`src/db/sql/`、シード）
- `npm run db:push`: スキーマの変更だけを反映する（列の名前を変えたときなど、確認を求められたら `db:reset` を使う）
- `npm run dev`: Web アプリを起動する（worktree ではポートを変える: `npm run dev -- -p 3001`）
- `npm test`: テスト用の DB（`<DB の名前>_test`）を作り直してからテストを流す。一部だけ: `npm test -- tests/core/time.test.ts`
- `npm run typecheck` / `npm run lint`
- `npm run mcp:config`: Claude Desktop の設定を出力する
- 開発用のログイン: `jushoku@example.com` / `password`（ほかのスタッフは `src/db/seed/core.ts`）
