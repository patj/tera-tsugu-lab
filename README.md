# tera-tsugu-lab（てらつぐ）

お寺の業務を支援する Web アプリ。仕様は [docs/spec.md](docs/spec.md)、実装のタスクは [docs/tasks/](docs/tasks/README.md)、開発の決まりは [CLAUDE.md](CLAUDE.md) を参照。

## 起動

必要なもの: Node.js 22 以上、Docker

```sh
npm install
docker compose up -d     # PostgreSQL
cp .env.example .env
npm run db:reset         # DB を作り、スキーマとシードを入れる
npm run dev              # http://localhost:3000
```

管理画面: http://localhost:3000/admin （開発用のログイン: `jushoku@example.com` / `password`）

## Claude Desktop から使う（MCP）

1. `npm run mcp:config` を実行する。この環境の絶対パスで設定が出力される
2. 出力された `mcpServers` を、Claude Desktop の設定ファイル（macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`）に加える
3. Claude Desktop を再起動する

操作者は `MCP_ACTOR`（スタッフのメールアドレス）で決まる。書き込みのツールは、プレビューを見せて了承を得てから `confirm_action` で実行される。

## テスト

```sh
npm test            # テスト用の DB（tera_test）を作り直して、tests/ を流す
npm run typecheck
npm run lint
```
