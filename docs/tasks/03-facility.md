# 03 施設予約

> 段階 1。00 が終わったら始める。
> 仕様: spec.md §6、§9（facilities、reservations。`contacts` は 01 の `createContact` を通して使う）
> 遅れたときに薄くする順番の 3 番目（外部の人からの申請画面を省き、MCP からの登録と承認だけにする）

## 担当する範囲
- `src/domain/facility/`、`src/db/schema/facility.ts`、`src/db/seed/facility.ts`
- `src/mcp/tools/facility.ts`
- `src/app/admin/facility/`、`src/app/reserve/`
- `tests/facility/`

## 依存先
- 00 基盤（`Actor`、時間の区間、施設の予約の排他制約）
- 01 台帳（`createContact`。公開の申請フォームだけが使う）

## 提供するインターフェース
**最初に作ってコミットする**（04 と 06 が使う）。すべて `@/domain/facility` から import する。

- `getFacilityBusyIntervals(facilityId, { from, to }, conn?)` → `pending` と `confirmed` の予約の時間（`Interval[]`、開始の順。申請中も埋まっているとみなす）。トランザクションの中で確かめ直すときは `conn` に `tx` を渡す
- `createReservation(actor, tx, { facilityId, kind, status, start, end, householdId?, contactId?, memorialServiceId?, title?, notes? })` → 重なりがあれば `conflict`。04 が法要を確定するときに、同じトランザクションの中で呼ぶ（`kind = memorial`、`status = confirmed`）。DB の排他制約に当たった場合も `conflict` にする。挿入はセーブポイントの中で行うので、`conflict` を受けても呼び出し側のトランザクションは壊れない。戻り値は `Reservation`（`id`、`requestCode` など）
- `cancelReservationsByMemorialService(actor, tx, memorialServiceId)` → 法要にひもづく申請中・確定の予約を `cancelled` にする。取り消した件数を返す
- `getAvailability({ from, to, templeId?, facilityIds? }, conn?)` → 施設ごとの◯×（予約の内容は返さない）。`from` と `to` は `"YYYY-MM-DD"`（両端を含む）。`templeId` を省くと `getDefaultTempleId()`。06 のポータルでも使う
  - 戻り値: `{ from, to, slots: [{ key: "am", label: "午前" }, { key: "pm", label: "午後" }], facilities: [{ id, name, days: [{ date, weekday, available: { am: boolean, pm: boolean } }] }] }`（`true` が◯）
- `getMainHallId(templeId, conn?)` → 本堂の ID（04 が候補を出すとき、本堂の予約を作るときに使う）。`listFacilities(templeId, conn?)` → 表示順の施設の一覧
- 種類と状態の表示名: `KIND_LABELS`、`STATUS_LABELS`、`kindLabel(kind)`、`statusLabel(status)`

## タスク

### ドメイン層
- [ ] 予約の作成（重なりのチェック）、承認（`pending` → `confirmed`）、お断り（理由を必須にする）、取り消し
- [ ] 申請番号（`request_code`）の発行。推測しにくく、電話でも伝えやすい形にする
- [x] 上のインターフェースとテスト
  - `pending` と `confirmed` には重ねられない。`rejected` と `cancelled` の時間には入れられる
  - 端がちょうど接する予約は重ならない
  - 承認するときにも、重なりを確かめ直す

### 管理画面（`/admin/facility`）
- [ ] 施設ごとの週表示と月表示（法要、前撮り、茶会、その他を色で分ける。申請中は区別して表示する）
- [ ] 予約の一覧（承認待ちを先頭に）
- [ ] 承認と、理由を添えたお断り
- [ ] 予約の登録（スタッフが電話で受けたときなど）

### 公開ページ（`/reserve`。スマートフォン向け、大きめの文字）
- [ ] 空き状況（◯×）。予約の内容は見せない
- [ ] 申請フォーム（施設、種類、日時、氏名、電話、メール、内容）。申請すると 01 の `createContact` で一般コンタクトを作り、`pending` の予約になり、申請番号を表示する 【薄くできる】
- [ ] 申請番号での状況の確認（申請中 / 確定 / お断りと理由） 【薄くできる】

### MCP（`src/mcp/tools/facility.ts`）
- [ ] `check_facility_availability`（読み取り）
- [ ] `list_reservations`（読み取り）。承認待ちで絞り込める。承認待ちの予約と重なる法要や予約があれば、あわせて返す（場面 4 で「法要と重ならないこと」を確かめるため）
- [ ] `create_reservation`（書き込み）
- [ ] `approve_reservation`（書き込み）
- [ ] `reject_reservation`（書き込み。理由が必須）

### シード（`src/db/seed/facility.ts`）
- [ ] 施設: 本堂、東席、中席、西席、庭園（この順で `position`）
- [ ] 2026 年 11 月〜2027 年 3 月の予約（前撮り、茶会など。確定と申請中の両方）
- [ ] 場面 4 で申請する 12/6 午前の本堂と 12/13 午後の東席は、空けておく（07 で台本と突き合わせて直す）

## 決めること
- ◯×の単位（日ごとの午前・午後とする案。前撮りやお茶会の申請が「午前」「午後」で来るため）と、表示する期間
- 申請フォームの日時の入力方法（午前 / 午後 / 時刻の指定）

## 依頼
（ほかの機能からの変更の依頼を書く）

## 完了の条件
- 重なりのチェックのテストが通る
- 台本の**場面 4** を通せる: スマートフォンから 2 件を申請する → 公開ページの◯×が変わる → Claude Desktop で「承認待ちの予約はある？」→ 法要と重ならないことを確かめて承認する
