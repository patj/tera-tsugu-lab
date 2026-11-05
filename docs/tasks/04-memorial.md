# 04 年忌法要の受付と申し込み

> 段階 2。01、02、03 のインターフェースがコミットされたら始める。**削らない**（台本の場面 0 がデモの主役）。
> 仕様: spec.md §3、§3.1、§4（MCP ツール）、§9（memorial_requests、memorial_services、memorial_service_targets）

## 担当する範囲
- `src/domain/memorial/`、`src/db/schema/memorial.ts`、`src/db/seed/memorial.ts`
- `src/mcp/tools/memorial.ts`
- `src/app/admin/memorial/`
- `tests/memorial/`

## 依存先
- 00 基盤（`Actor`、時間の区間、設定、トランザクション）
- 01 台帳（年忌の計算、`searchDeceased`、`getHousehold`）
- 02 カレンダー（`listOfficiants`、`getStaffBusyIntervals`、`createSharedEvent`、`cancelEventsByMemorialService`）
- 03 施設予約（`getFacilityBusyIntervals`、`createReservation`、`cancelReservationsByMemorialService`）

## 提供するインターフェース
06 のポータルが使う。ポータルが先に始まるときのために、早めにコミットする。

- `createMemorialRequest(actor, { householdId, targets: [{ personId, kaiki }], seshuPersonId? | seshuName?, preferredPeriods, location, attendees, otoki, notes })` → `source = portal`、状態 `requested`。代理で申し込んだ人（`requested_by_person_id`）を記録する
- `listMemorialRequestsForHousehold(householdId)` → 状態（受付済み / 確定 / お断りと理由）つき
- `getHouseholdMemorialSchedule(householdId)` → 確定した法要と、今後の年忌の目安（例: 「2027 年 父・太郎 七回忌」）
- `suggestKaiki(personId, year)` → 申し込みフォームで回忌を自動で提案する

## タスク

### 年忌の検証（`verifyMemorial`）
- [ ] §3 の 4 つのチェックとテスト
  1. 故人の取り違え: 候補が複数なら、法号と没年を並べて返す（自動で 1 人に決めない）
  2. 回忌と年の対応: 希望の年が何回忌かを計算し、依頼された回忌と食い違えば指摘する
  3. 命日より後の日: 希望日がその年の祥月命日より後なら警告する（受け付けはする。§12 E-1）
  4. 複数霊位供養の提案: 同じ世帯に、同じ年に年忌を迎える故人がほかにいれば提案する

### 候補の日時（`findMemorialSlots`）
- [ ] 希望の期間の中で、担当者（`is_officiant`、または指定された人）が空いていて、本堂も空いている時間を列挙する。テストを書く
  - 開始時刻は 10:00〜15:00、1 時間刻み（お寺の設定から取る）
  - お寺で行う場合: 本堂と担当者を「40 分＋前後 10 分ずつ」で押さえる
  - 自宅・墓前の場合: 本堂は見ない。担当者を「移動時間（行き）＋法要＋移動時間（帰り）」で押さえる
  - 申請中（`pending`）の施設予約も埋まっているとみなす
  - 祥月命日より前の日を先に並べる

### 登録（`bookMemorialService`）
- [ ] 1 つのトランザクションで次をまとめて行う。テストを書く
  - 空きを確かめ直す（候補を出したあとに埋まった場合に備える）
  - `memorial_services` と `memorial_service_targets`（故人ごとの回忌）を作る
  - 担当者の業務の予定を作る（02 の `createSharedEvent`）
  - お寺で行う場合は、本堂の予約を `confirmed` で作る（03 の `createReservation`）
  - `memorial_request_id` があれば、その申し込みを `scheduled` にしてひもづける。なければ `source = phone`、状態 `scheduled` の申し込みを作る
  - 自宅・墓前の場合は、行きと帰りの移動時間を必須にする
- [ ] 途中で失敗したら、何も登録されないことをテストで確かめる

### 申し込みの受付
- [ ] 上の「提供するインターフェース」とテスト
- [ ] お断り（`declineMemorialRequest`。理由が必須。状態 `declined`）
- [ ] 法要の取り消し（`cancelled`。ひもづく施設の予約とスタッフの予定も取り消す。管理画面からだけ）

### 管理画面（`/admin/memorial`）
- [ ] 法要の一覧（期間、担当者、場所）と詳細
- [ ] 申し込みの一覧（受付済みを先頭に）と詳細。詳細で、検証の結果と候補の日時を見て、日時を確定する・お断りする
- [ ] 電話で受けた法要の登録（故人を選ぶ → 検証 → 候補 → 確定）
- [ ] 法要の取り消し
- [ ] 表示は「複数霊位供養」の用語を使う

### MCP（`src/mcp/tools/memorial.ts`）
- [ ] `verify_memorial`（読み取り）
- [ ] `find_memorial_slots`（読み取り）
- [ ] `list_memorial_requests`（読み取り）
- [ ] `book_memorial_service`（書き込み）。プレビューに、作られる法要、担当者の予定、本堂の予約、申し込みの扱いを並べる。自宅・墓前のときは移動時間を必須の引数にする（指定がなければ Claude が住職に尋ねる）
- [ ] `decline_memorial_request`（書き込み。理由が必須）
- [ ] ツールの説明文を、場面 0 の流れ（故人の特定 → 検証 → 候補 → 確定）で Claude が迷わない書き方にする

### シード（`src/db/seed/memorial.ts`）
- [ ] 確定した法要を数件（11 月〜3 月）。担当者の予定と本堂の予約も、`bookMemorialService` を通して作る
- [ ] ポータルから受けた申し込み（`requested`）を 1〜2 件（場面 5 と重ならない家にする）

## 決めること
- 担当者を指定しないときの候補の出し方（担当者ごとに分けて並べる案）
- 候補の件数の上限

## 依頼
（ほかの機能からの変更の依頼を書く）

## 完了の条件
- 検証、候補、登録のテストが通る
- Claude Desktop で、台本の**場面 0** を通せる: 山田さんのお父さんの七回忌を 3 月に → 故人の確認 → 検証（回忌、命日、複数霊位供養の提案）→ 候補 → 「3/15 の 10 時、住職の担当で」→ プレビュー → 了承 → 法要、担当者の予定、本堂の予約、電話の申し込みが登録され、管理画面のカレンダーに出る
