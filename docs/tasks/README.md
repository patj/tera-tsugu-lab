# 実装タスク

> 仕様は [docs/spec.md](../spec.md) を正とする。このディレクトリには、仕様を実装するためのタスクを機能ごとに分けて置く。
> 日付は目安。順番は「段階」と「依存関係」で決める。

## ファイルの一覧

| ファイル | 機能 | 仕様の節 | 段階 |
|---|---|---|---|
| [00-foundation.md](00-foundation.md) | 基盤（ひな形、スキーマ、認証、MCP の本体、シードの枠組み） | §1、§4、§8、§9 | 0 |
| [01-ledger.md](01-ledger.md) | 檀家管理コア（台帳、年忌の計算、対応記録） | §2 | 1 |
| [02-calendar.md](02-calendar.md) | スタッフのカレンダー | §3.2 | 1 |
| [03-facility.md](03-facility.md) | 施設予約 | §6 | 1 |
| [05-forms.md](05-forms.md) | 行事・アンケートフォーム | §5 | 1 |
| [04-memorial.md](04-memorial.md) | 年忌法要の受付と申し込み | §3、§3.1 | 2 |
| [06-portal.md](06-portal.md) | 檀家ポータル | §2.1 | 2 |
| [07-demo.md](07-demo.md) | 台本の通し確認 | §10、§11 | 3 |

## 段階と依存関係

```
段階 0（1 人で直列に作る）
  00 基盤
     │
段階 1（並列で作れる）
  ├─ 01 台帳
  ├─ 02 カレンダー
  ├─ 03 施設予約
  └─ 05 フォーム ……… person_list の自動入力に 01 の関数を使う（先にスタブで進めてよい）
     │
段階 2（並列で作れる）
  ├─ 04 法要の受付 …… 01 の年忌の計算、02 と 03 の「埋まっている時間」を使う
  └─ 06 檀家ポータル … 01、03 の空き状況（◯×）、04 の申し込み、05 の回答を使う
     │
段階 3
  07 台本の通し確認
```

- 段階 1 の各機能は、ほかの機能に渡す関数（各ファイルの「提供するインターフェース」）を**最初に**作ってコミットする。段階 2 の機能はそれを使う
- 04 は、01〜03 のインターフェースがコミットされていれば、段階 1 のうちに始めてよい
- 06 は、ログインや家系図など、04 と 05 を使わない部分から始めてよい

## 並列で作るときの決まり

ファイルの衝突を避けるため、ソースも機能ごとに分ける。この形は段階 0 で作っておく。

```
src/
  domain/<機能>/        # 業務ロジック。Web と MCP の両方から使う
  db/schema/<機能>.ts   # その機能のテーブル。schema/index.ts でまとめて export する
  db/seed/<機能>.ts     # その機能のシード。seed/index.ts が順番に呼ぶ
  mcp/tools/<機能>.ts   # その機能の MCP ツール。mcp/tools/index.ts でまとめる
  app/admin/<機能>/     # 管理画面
  app/portal/           # 檀家ポータル（06）
  app/f/[formId]/       # 公開フォーム（05）
  app/reserve/          # 施設の申請と空き状況（03）
tests/<機能>/           # テスト
```

| 機能 | `<機能>` の名前 |
|---|---|
| 00 基盤 | `core`（共通の型、時間の区間、設定、監査ログ、操作者） |
| 01 台帳 | `ledger` |
| 02 カレンダー | `calendar` |
| 03 施設予約 | `facility` |
| 04 法要の受付 | `memorial` |
| 05 フォーム | `forms` |
| 06 ポータル | `portal` |

- **書き換えてよいのは、自分の機能のディレクトリとファイルだけ**。ほかの機能の関数は呼ぶだけにする。変更が必要なら、その機能のタスクファイルの「依頼」の欄に書き足す
- **共有のファイル**（`src/db/schema/index.ts`、`src/db/seed/index.ts`、`src/mcp/tools/index.ts`、`src/app/admin/nav.ts`、`package.json`）には、行を追記するだけにする。衝突しても解決しやすくするため
- **テーブルの持ち主は 1 つの機能だけ**にする。ほかの機能は、持ち主の関数を通して使う

  | 機能 | 持つテーブル |
  |---|---|
  | core | `temples`、`staff`、`pending_actions`、`audit_logs` |
  | ledger | `households`、`persons`、`person_relations`、`contacts`、`contact_logs` |
  | calendar | `staff_events`、`staff_event_assignees` |
  | facility | `facilities`、`reservations` |
  | memorial | `memorial_requests`、`memorial_services`、`memorial_service_targets` |
  | forms | `forms`、`form_questions`、`form_household_tokens`、`form_responses` |
  | portal | `portal_accounts`、`portal_invites`、`portal_login_tokens` |
- **スキーマの変更**: 段階 0 で全テーブルを作る。並列で作業している間に変える場合は、自分の `db/schema/<機能>.ts` だけを変え、`npm run db:push` で反映する（マイグレーションのファイルは作らない。番号が衝突するため）。Drizzle の push で作れないもの（拡張、排他制約）は `src/db/sql/` の SQL ファイルに書き、`db:reset` が push のあとに流す
- **作業場所**: 機能ごとに git worktree を作る（ブランチ名は `feat/<機能>`）。終わったら `spec-and-scaffold` にマージする
  - **worktree ごとに別の DB を使う**。同じ Postgres のコンテナの中に、`tera_<機能>` と `tera_<機能>_test` の DB を作り、worktree ごとの `.env` の `DATABASE_URL` で切り替える。DB を共有すると、`db:push` がほかの worktree で追加した列を消してしまうため
  - worktree ごとに `.env` を作り（`cp .env.example .env` のあと `DATABASE_URL` の DB の名前を変える）、`npm install` と `npm run db:reset` を行う。DB がなければ `db:reset` と `npm test` が作る
  - `npm run dev` のポートを分ける（例: 台帳 `npm run dev -- -p 3001`、カレンダー 3002、施設 3003、フォーム 3005、法要 3004、ポータル 3006）
- **完了したタスク**は `[x]` にして、実装と同じコミットに含める
- **仕様にないことを決めたら**、`docs/spec.md` の決定事項と決定ログ（§13）にも書く。各タスクファイルの「決めること」は、着手したときに決める

## 基盤（00）が用意したもの

各機能は、これを使って作る。詳しくは各ファイルの先頭のコメントと `CLAUDE.md` を参照。

| 用途 | 場所 |
|---|---|
| 操作者（`Actor`、`staffActor`、`portalActor`） | `src/domain/core/actor.ts` |
| エラー（`invalid`、`notFound`、`forbidden`、`conflict`、`isConstraintViolation`） | `src/domain/core/errors.ts` |
| 時間の区間と日本時間（`overlaps`、`freeIntervals`、`jst`、`formatJst`、`parseJstDateTime` など） | `src/domain/core/time.ts` |
| お寺の設定と宗派プリセット（`getTemple`、`getTempleSettings`、`getSectPreset`） | `src/domain/core/temple.ts`、`sect.ts` |
| スタッフ（`listStaff`、`getStaffById`） | `src/domain/core/staff.ts` |
| 監査ログ（`writeAuditLog`） | `src/domain/core/audit.ts` |
| DB とトランザクションの型（`db`、`Tx`、`DbOrTx`） | `src/db/client.ts` |
| 管理画面のログインしているスタッフ（`getCurrentStaff`、`getStaffActor`） | `src/lib/staff-auth.ts` |
| 署名つきのトークン（ポータルのログインの状態にも使える） | `src/lib/signed-token.ts` |
| MCP のツールの定義（`defineReadTool`、`defineWriteTool`） | `src/mcp/framework/define.ts`。例は `src/mcp/tools/core.ts` |
| シードの ID の受け渡し（`ctx.set("household:yamada", id)` / `ctx.get(...)`） | `src/db/seed/context.ts`。スタッフは `staff:jushoku` など |
| テストの DB の準備（`resetDb()`。シードまで入れる） | `tests/helpers/db.ts`。例は `tests/core/` |

## 遅れたときに薄くする順番

`spec.md` §10 と同じ。各タスクファイルでは、該当するタスクに **【薄くできる】** と書いてある。

1. 06 檀家ポータル: 家系図を一覧表示にする → 家族の権限を固定にする → 場面 3 の檀家の回答は個別リンクのままにする
2. 05 フォーム: ビルダーの画面を省き、MCP からの作成だけにする
3. 03 施設予約: 外部の人からの申請画面を省き、MCP からの登録と承認だけにする

**削らないもの**: 台本の場面 0〜2（01、02、04 と MCP）

## このディレクトリに入れないもの

- メンタルケア（§7）: 保留中。基本機能が完成してから、タスクを作る
- 【ハッカソン後】の項目（連絡先の変更申請、ポータルからの施設の申請、所属の履歴、物理削除など）
