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

実装（`src/domain/forms/index.ts` から import する）:
- `listOpenFormsForPortal(templeId?)` → `{ id, title, description, mode, createdAt }[]`。`templeId` を省くと最初のお寺（`getDefaultTempleId`）
- `getFormForRespondent(formId, { source, householdId? })` → `RespondentForm | null`（ない、または下書きなら null）
  - `availability`（`ok` / `closed` / `mode_mismatch`）と `notice`（利用者に見せる文）で、回答できるかを返す
  - `questions[].itemFields[].autoFill` = 家族を選ぶと台帳から入る項目。`questions[].candidates` = 生きている家族（`personId`、`name`、`values`: 項目のキー → 台帳の値）
- `submitResponse(actor, formId, { source, householdId?, personId?, answers })` → `{ id }`
  - `answers` は `{ [設問の ID]: 値 }`。`person_list` の値は `{ personId?, values: { [項目のキー]: 文字列 } }[]`
  - `source = "portal"` のときは `actor`（`portalActor`）の `personId` で回答者と世帯を決める（`householdId` を渡すなら一致すること）
  - `source = "member_link"` のときは、呼ぶ側がトークンを `resolveHouseholdToken(formId, token)` で世帯に引いてから渡す
- `listResponsesOfPerson(personId)` / `listResponsesOfHousehold(householdId)` → `MyResponse[]`（フォームの題名、受付日時、設問の順の回答 `items: { label, value }[]`）。権限の確認は呼ぶ側で行う

## タスク

### ドメイン層
- [x] フォームと設問の作成、更新、状態（`draft` / `open` / `closed`）
- [x] 設問の種類: 単一選択、複数選択、短い記述、長い記述、数値、日付、`person_list`（1 人分の項目のまとまりを最大 N 人分）
- [x] 回答の入口ごとの設問の出し分け（`public` は全項目。個別リンクとポータルは `profile_field` の設問を隠す）とテスト
- [x] `person_list` の自動入力: 家族を選ぶと、カナ、氏名、生年月日、性別を台帳から入れる。台帳にない項目（祈願の主旨など）だけを入力させる。テストを書く
- [x] 世帯ごとの個別リンクのトークンの発行（推測できない値）
- [x] 回答の検証（必須、選択肢、人数の上限）
- [x] 集計とテスト: 回答の件数、選択肢ごとの件数、数値の合計、`person_list` に入力された人数の合計。それぞれ「檀家」「一般」「合計」
- [x] 回答と名簿（`person_list` を 1 人 1 行に展開したもの）の CSV。Excel で文字化けしないように BOM をつける

### 管理画面（`/admin/forms`）
- [x] フォームの一覧と状態の変更
- [x] フォームのビルダー（設問の追加、並べ替え、種類、選択肢、必須、`profile_field`、`person_list` の項目と人数） 【薄くできる】
- [x] 世帯ごとの個別リンクの一覧（印刷用。QR コードは作らない。【決定】を参照）
- [x] 集計と回答の一覧。回答と名簿の CSV 出力

### 公開フォーム（`/f/[formId]`。スマートフォン向け、大きめの文字）
- [x] 共通リンク（全項目）と、個別リンク（`?t=<トークン>`。簡易版。世帯にひもづく）
- [x] `person_list` の入力欄（個別リンクのときは家族を選ぶと自動で入る）
- [x] 送信後の完了画面
- [x] 公開モードと入口が合わないとき（`members` のフォームを共通リンクで開いた、など）や、`closed` のときの表示

### MCP（`src/mcp/tools/forms.ts`）
- [x] `create_form`（書き込み）: Claude が自然言語から組み立てた設問の構造を受け取り、フォームを作って `open` にし、公開リンクを返す。プレビューに設問の一覧を出す
- [x] `get_form_results`（読み取り）: 檀家、一般、合計の件数。`person_list` の人数の合計

### シード（`src/db/seed/forms.ts`）
- [x] 過去の行事のフォーム（花まつり。`closed`、回答あり）
- [x] ほうろく灸のフォームは、デモで MCP から作るのでシードに入れない

## 決めること
- `create_form` の引数の形（設問の配列。Claude が組み立てやすい形にする）
  - 【決定】`{ title, description?, mode, questions: [{ type, label, description?, required?, options?, profile_field?, max_persons?, item_fields?: [{ label, type, required?, options?, profile_field? }] }] }`。種類ごとに形を変える union にはせず、1 つの平らな形にし、種類に合わない組み合わせはドメイン層（`validateFormDraft`）で日本語のエラーにする。引数の名前は snake_case。項目のキーは省略でき、`profile_field` か `f<番号>` から作る。理由: Claude が迷わず組み立てられ、誤りをプレビューの時点で伝えられるため。説明文に場面 3 の組み立て例を書いた
  - 【決定】`create_form` は作ったフォームをすぐ受付中（`open`）にし、`both` / `members` では檀家（`active`）の全世帯の個別リンクを同じトランザクションで発行する。MCP には共通リンクと発行した件数、個別リンクの一覧の管理画面の URL を返す（30 世帯分のリンクは返さない）
  - 【決定】一般の方も答えるフォームで、代表者の氏名（`profile_field = name`）と連絡先（`phone` / `email`）の設問がないときは、プレビューに注意を出す（作ることはできる）
- 個別リンクの QR コードを作るか（作るならライブラリを選ぶ）
  - 【決定】作らない。依存を足すことになり、デモ（場面 3）にも出てこないため。個別リンクの一覧は印刷できる表にした（ハッカソン後に QR コードを足す）

## 決めたこと（仕様にないこと。spec.md への反映は統合する人が行う）
- 【決定】回答（`form_responses.answers`）は `{ [設問の ID]: 値 }` で持つ。`person_list` は `{ personId?, values: { [項目のキー]: 文字列 } }[]`。家族を選んだ人は `personId` を持つので、名簿の CSV に「台帳から」の印を出せる
- 【決定】回答が 1 件でも届いたフォームの設問は変えられない（題名、説明、公開範囲、状態は変えられる）。回答を設問の ID で持つため。回答のあるフォームは下書きに戻せない
- 【決定】「檀家」= 世帯にひもづく回答（個別リンク、ポータル）、「一般」= 共通リンクの回答。檀家が共通リンクから答えたものは一般として数える（どの世帯か確かめられないため）
- 【決定】個別リンクとポータルで隠した設問（`profile_field`）は、回答の時点の台帳の値で埋めて保存する（住所と電話は世帯、氏名・カナ・生年月日・性別・メールは回答者。個別リンクの回答者は世帯の窓口、いなければ世帯主）。`respondent_name` と `contact` は、どの入口でも氏名と電話・メールの設問の値から入れる
- 【決定】`person_list` で家族を選んだ人は、台帳にある項目を台帳の値で上書きして保存する（ブラウザから送られた値は使わない）。台帳に値がない項目（生年月日が未登録など）は入力してもらう。家族以外の人を手で入力することもできる。家族は、その世帯の生きている人だけ選べる
- 【決定】台帳の性別（`male` / `female`）は、項目の選択肢のうち「男」「女」を含むものに合わせる（「男性」「女性」でもよい）
- 【決定】個別リンクのトークンは 128 ビットの乱数（base64url）。受付中にしたとき（作成時、状態の変更時、公開範囲の変更時）に、まだない檀家の世帯に発行する。あとから増えた世帯には、個別リンクの一覧の画面のボタンで発行する
- 【決定】公開範囲が `public` のフォームにトークンつきで来た場合は、共通リンクとして扱う。`members` のフォームを共通リンクで開いた場合と、締め切りのフォームは、案内の文だけを表示する。下書きのフォームは 404 にする
- 【決定】公開リンクの URL の基準は環境変数 `APP_BASE_URL`（なければ `http://localhost:3000`）。`.env.example` は共有のファイルなので、統合のときに足す
- 【決定】数値の設問は 0〜1,000,000 の整数（参加人数を想定）。短い記述は 200 文字、長い記述は 2000 文字まで
- 【決定】`listOpenFormsForPortal` は、お寺を省略できる引数 `templeId?` をとる（ハッカソン版はお寺が 1 つなので、省くと最初のお寺）
- 【決定】回答の送信も監査ログに残す（`forms.respond`。個人の情報は書かず、フォームと入口だけ）

## 統合のときにすること
- `src/domain/forms/ledger-adapter.ts` の仮の関数を `@/domain/ledger` の関数に置き換える（ファイルの先頭に対応を書いた）。01 に提供を頼みたいもの: 檀家（`active`）の世帯の一覧（個別リンクの発行）、個人 1 人の読み取り（ポータルの回答者）、世帯の名前をまとめて引く関数（回答の一覧と CSV）
- `.env.example` に `APP_BASE_URL=http://localhost:3000` を足す
- 台帳のシードが入ったら、シードの順番を `ledger` → `forms` にする（花まつりのフォームを作るときに、檀家の世帯の個別リンクも発行されるため）

## 依頼
（ほかの機能からの変更の依頼を書く）

## 完了の条件
- 出し分け、自動入力、集計のテストが通る
- 台本の**場面 3** を、檀家の回答を個別リンクにして通せる: Claude Desktop でほうろく灸のフォームを作る（`both`、`person_list`）→ 山田さんが個別リンクから家族を選んで回答する → 一般の人が共通リンクから回答する → 「今何人？」→ 管理画面で名簿の CSV を出す
