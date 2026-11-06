# お寺のアプリ 開発キット

お寺のシステム（てらつぐ）に組み込む「お寺のアプリ」を作り、手元で試すためのキット。人向けの説明は `README.md`。
作ったアプリ（`apps/<app-id>/`）は、お寺が zip で送り、運用者がレビューしてから本体に組み込む。

## アプリを作るときの決まり

**`apps/CLAUDE.md` に従う**（本体と同じ決まり。これを守れば、本体にそのまま入る）。
「〇〇のアプリを作りたい」と言われたら、skill `new-temple-app` を使う。

`apps/CLAUDE.md` のうち、次の点はキットでは読み替える。
- `npm run apps:gen` はいらない（試す画面は、`apps/` の中のアプリを自動で読み込む）
- 本体の画面（`/apps`、`/admin/apps`）のかわりに、試す画面（`npm run dev`。http://localhost:5173）の「利用者の画面」と「スタッフの画面」で確かめる
- `npm run lint` はない。`npm run apps:check` と `npm run typecheck` で確かめる
- `docs/apps-guide.md` のかわりに `README.md` を見る

## 変えてはいけないもの

- `sdk/`（本体と同じ形の SDK。キットでは、保存先がブラウザの中になっているだけ）
- `preview/`（試す画面）、`scripts/`（決まりのチェック）、`package.json`、`tsconfig.json`、`vite.config.mts`
- `apps/_template/`（ひな形。コピーして使う）

アプリが必要とする機能が SDK にないときは、キットや SDK を変えて実現しない。できないことを伝え、できる範囲の案を出す（例: お寺に送る、お寺が内容を編集する、檀家としてログインする、外部のサービスを使う、はまだできない）。

## 確かめ方

```sh
npm run apps:check   # 決まりのチェック（違反 0 件）
npm run typecheck
npm run dev          # 試す画面
```
