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
- [ ] `care` の名前を `apps` に変える（テーブル、ドメイン層、SDK、画面、cookie、環境変数、スクリプト、npm のスクリプト、テスト）
- [ ] 危機検知、相談窓口、注意書き、アラート（`care_alerts`）、項目の定義（fields、schema）と、決まった形のフォームを消す
- [ ] 開発用の DB の古いテーブル（`care_*`）を消す

### データと安全の仕組み
- [ ] テーブル（`app_users`、`app_documents`、`app_consents`）。すべてに `temple_id`
- [ ] 文書の保存（自由形式の JSON。作る、一覧、更新、削除）。暗号化（鍵は `APPS_ENCRYPTION_KEY`）。上限（1 件 100 KB、利用者 × アプリごとに 1,000 件）
- [ ] 共有の設定（`sharing: true` のアプリだけ。履歴、監査ログ）
- [ ] スタッフ向け: 共有している利用者の一覧、共有された文書（開くたびに監査ログ）
- [ ] すべての関数で、MCP の操作者を拒否する

### アプリの仕組み
- [ ] `@/apps-sdk`: `defineAppManifest`、`useAppStorage<T>()`、`AppAdminProps<T>` などの型
- [ ] 文書の読み書きの API（`/apps/api/<app-id>/docs`。cookie の利用者だけ。同じオリジンからだけ）
- [ ] `npm run apps:gen`（`predev`、`prebuild`）、`npm run apps:check`（必要なファイル、import の許可リスト、外部への送信など、manifest の id、一覧が最新か）
- [ ] ひな形（`apps/_template/`）、`apps/CLAUDE.md`、skill（`.claude/skills/new-temple-app/`）、手順書（`docs/apps-guide.md`）

### 画面
- [ ] 利用者: はじめの画面（ニックネーム。端末を変えると戻れないことを明示）、アプリの一覧、アプリの画面（基盤の帯と共有の設定へのリンク）、共有の設定
- [ ] スタッフ: アプリの一覧、共有している利用者の一覧、共有された文書（アプリの Admin.tsx）

### テスト
- [ ] 暗号化（往復、改ざん、付け替え）、文書の読み書きと上限、共有（共有 → やめるとすぐに見えない、共有し直すと過去の文書も見える）、他人の文書に触れない、MCP の拒否、監査ログ（本文とニックネームを残さない）、DB に平文が残らない、`apps:check`

## 決めたこと
- spec.md §7 のとおり（能力は個人の保存とお寺との共有だけ、利用者は匿名だけ、アプリはリポジトリの中の React）
- コードの名前: アプリは `apps/<app-id>/`、ドメイン層は `src/domain/apps/`、SDK は `src/apps-sdk/`、テーブルは `app_*`、利用者の画面は `/apps`、cookie は `tera_apps`（パス `/apps`）

## 決めること
- 文書の読み書きの API の形（Route Handler にするか、Server Actions にするか）

## 依頼
- なし
