# 05 行事・アンケートフォーム

> 段階 1。00 が終わったら始める。`person_list` の自動入力は 01 の `getHouseholdMembers` を使う（01 が間に合わなければスタブで進める）。
> 仕様: spec.md §5、§9（forms、form_questions、form_household_tokens、form_responses）
> 遅れたときに薄くする順番の 2 番目（ビルダーの画面を省き、MCP からの作成だけにする）

## 担当する範囲
- `src/domain/forms/`、`src/db/schema/forms.ts`、`src/db/seed/forms.ts`
- `src/mcp/tools/forms.ts`
- `src/app/admin/forms/`、`src/app/f/[formId]/`
- `tests/forms/`

## 依存先
- 00 基盤
- 01 台帳（`getHouseholdMembers`、世帯の住所と電話）

## 提供するインターフェース
06 のポータルが使う。

- `listOpenFormsForPortal()` → 公開モードが `members` か `both` で、`open` のフォーム
- `getFormForRespondent(formId, { source, householdId? })` → 回答の入口に合わせた設問（`profile_field` の設問を隠す。`person_list` に家族の候補をつける）
- `submitResponse(actor, formId, { source, householdId?, personId?, answers })` → `person_list` で選んだ家族の、台帳でわかる項目を補って保存する
- `listResponsesOfPerson(personId)` / `listResponsesOfHousehold(householdId)` → 自分や世帯の申し込みの確認

## タスク

### ドメイン層
- [ ] フォームと設問の作成、更新、状態（`draft` / `open` / `closed`）
- [ ] 設問の種類: 単一選択、複数選択、短い記述、長い記述、数値、日付、`person_list`（1 人分の項目のまとまりを最大 N 人分）
- [ ] 回答の入口ごとの設問の出し分け（`public` は全項目。個別リンクとポータルは `profile_field` の設問を隠す）とテスト
- [ ] `person_list` の自動入力: 家族を選ぶと、カナ、氏名、生年月日、性別を台帳から入れる。台帳にない項目（祈願の主旨など）だけを入力させる。テストを書く
- [ ] 世帯ごとの個別リンクのトークンの発行（推測できない値）
- [ ] 回答の検証（必須、選択肢、人数の上限）
- [ ] 集計とテスト: 回答の件数、選択肢ごとの件数、数値の合計、`person_list` に入力された人数の合計。それぞれ「檀家」「一般」「合計」
- [ ] 回答と名簿（`person_list` を 1 人 1 行に展開したもの）の CSV。Excel で文字化けしないように BOM をつける

### 管理画面（`/admin/forms`）
- [ ] フォームの一覧と状態の変更
- [ ] フォームのビルダー（設問の追加、並べ替え、種類、選択肢、必須、`profile_field`、`person_list` の項目と人数） 【薄くできる】
- [ ] 世帯ごとの個別リンクの一覧（印刷用。QR コードはあれば）
- [ ] 集計と回答の一覧。回答と名簿の CSV 出力

### 公開フォーム（`/f/[formId]`。スマートフォン向け、大きめの文字）
- [ ] 共通リンク（全項目）と、個別リンク（`?t=<トークン>`。簡易版。世帯にひもづく）
- [ ] `person_list` の入力欄（個別リンクのときは家族を選ぶと自動で入る）
- [ ] 送信後の完了画面
- [ ] 公開モードと入口が合わないとき（`members` のフォームを共通リンクで開いた、など）や、`closed` のときの表示

### MCP（`src/mcp/tools/forms.ts`）
- [ ] `create_form`（書き込み）: Claude が自然言語から組み立てた設問の構造を受け取り、フォームを作って `open` にし、公開リンクを返す。プレビューに設問の一覧を出す
- [ ] `get_form_results`（読み取り）: 檀家、一般、合計の件数。`person_list` の人数の合計

### シード（`src/db/seed/forms.ts`）
- [ ] 過去の行事のフォーム（花まつり。`closed`、回答あり）
- [ ] ほうろく灸のフォームは、デモで MCP から作るのでシードに入れない

## 決めること
- `create_form` の引数の形（設問の配列。Claude が組み立てやすい形にする）
- 個別リンクの QR コードを作るか（作るならライブラリを選ぶ）

## 依頼
（ほかの機能からの変更の依頼を書く）

## 完了の条件
- 出し分け、自動入力、集計のテストが通る
- 台本の**場面 3** を、檀家の回答を個別リンクにして通せる: Claude Desktop でほうろく灸のフォームを作る（`both`、`person_list`）→ 山田さんが個別リンクから家族を選んで回答する → 一般の人が共通リンクから回答する → 「今何人？」→ 管理画面で名簿の CSV を出す
