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
- **操作者の注意**: `createReservation` で `status = confirmed` や `kind = memorial` の予約を作るとき、承認・お断り・取り消し、`cancelReservationsByMemorialService` は、`staffId` を持つ操作者が必要（なければ `forbidden`）。スタッフ以外（公開ページの申請者）は、申請中の前撮り・茶会・その他だけを作れる。シードでは `systemActor` に `staffId` がないので、`{ ...ctx.actor, staffId: ctx.get("staff:jushoku") }` を渡す

## タスク

### ドメイン層
- [x] 予約の作成（重なりのチェック）、承認（`pending` → `confirmed`）、お断り（理由を必須にする）、取り消し
- [x] 申請番号（`request_code`）の発行。推測しにくく、電話でも伝えやすい形にする
- [x] 上のインターフェースとテスト
  - `pending` と `confirmed` には重ねられない。`rejected` と `cancelled` の時間には入れられる
  - 端がちょうど接する予約は重ならない
  - 承認するときにも、重なりを確かめ直す

### 管理画面（`/admin/facility`）
- [x] 施設ごとの週表示と月表示（法要、前撮り、茶会、その他を色で分ける。申請中は区別して表示する）
  - `/admin/facility/calendar`。週表示は施設×曜日（月曜始まり）、月表示は施設を選ぶか、すべての施設。確定は塗りつぶし、申請中は点線の枠と「申請中」
- [x] 予約の一覧（承認待ちを先頭に）
  - `/admin/facility`。今後の予約 / 承認待ち / すべて
- [x] 承認と、理由を添えたお断り
  - `/admin/facility/[id]`。承認待ちの予約には「重なりの確認」（同じ時間の法要、ほかの施設の予約）を出す。取り消しもここ（法要の予約は除く）
- [x] 予約の登録（スタッフが電話で受けたときなど）
  - `/admin/facility/new`。申込者の氏名を入れると一般コンタクトも作る（`registerReservation`）

### 公開ページ（`/reserve`。スマートフォン向け、大きめの文字）
- [x] 空き状況（◯×）。予約の内容は見せない
  - `/reserve`。施設を選び、28 日ずつ表示する。◯ を押すと、その日と時間帯を入れた申請フォームに進む
- [x] 申請フォーム（施設、種類、日時、氏名、電話、メール、内容）。申請すると 01 の `createContact` で一般コンタクトを作り、`pending` の予約になり、申請番号を表示する 【薄くできる】
  - `/reserve/apply`。`createContact` は今は仮のアダプター（`src/domain/facility/ledger-adapter.ts`）を通す。統合時に 01 の関数に置き換える
- [x] 申請番号での状況の確認（申請中 / 確定 / お断りと理由） 【薄くできる】
  - `/reserve/status?code=...`。申請の直後は、ここに申請番号を大きく表示する

### MCP（`src/mcp/tools/facility.ts`）
- [x] `check_facility_availability`（読み取り）
- [x] `list_reservations`（読み取り）。承認待ちで絞り込める。承認待ちの予約と重なる法要や予約があれば、あわせて返す（場面 4 で「法要と重ならないこと」を確かめるため）
- [x] `create_reservation`（書き込み）
- [x] `approve_reservation`（書き込み）
- [x] `reject_reservation`（書き込み。理由が必須）
- [x] 件名と申請者の名前を LLM に返さない（spec.md §4「LLM に渡す情報」、11/6 の決定）
  - `check_facility_availability` と `list_reservations`: 予約は目的（法要 / 前撮り / 茶会 / その他）と状態で表し、件名は返さない（件名があれば「あり」）
  - `list_reservations` と、`approve_reservation` / `reject_reservation` のプレビュー、書き込みの結果: 申請者の名前は最初の 1 文字だけを残して伏せる（檀家の予約は名前を返さない）。申請番号と URL を添える
  - 【決定】`create_reservation` のプレビューは、住職が渡した件名と申込者の名前をそのまま見せる（住職が入力したもので、すでに LLM に渡っているため。登録の結果は伏せる）

### シード（`src/db/seed/facility.ts`）
- [x] 施設: 本堂、東席、中席、西席、庭園（この順で `position`）
- [x] 2026 年 11 月〜2027 年 3 月の予約（前撮り、茶会など。確定と申請中の両方）
- [x] 場面 4 で申請する 12/6 午前の本堂と 12/13 午後の東席は、空けておく（07 で台本と突き合わせて直す）

#### シードの名前と予約
- 名前（`ctx.get(...)`）: `facility:hondo`（本堂）、`facility:higashi`（東席）、`facility:naka`（中席）、`facility:nishi`（西席）、`facility:teien`（庭園）
- 予約はドメイン層（`createReservation`）を通して作る。世帯や一般コンタクトにはひもづけず、申請者の名前は件名（`title`）に入れる。一覧は `SEED_RESERVATIONS`（`src/db/seed/facility.ts`）
- 本堂の予約（04 のシードで法要を入れるときは、ここを避ける）
  - 11/15（日）10:00〜12:00 前撮り（お断り）、11/28（土）13:00〜15:00 前撮り（確定）
  - 12/6（日）14:00〜16:00 前撮り（確定。午前は場面 4 のために空けている）
  - 1/16（土）13:00〜15:00 前撮り（申請中）、1/23（土）10:00〜12:00 前撮り（確定）
  - 3/14（日）10:00〜12:00 前撮り（確定）、3/15（月）14:00〜16:00 前撮り（確定）、3/16（火）13:00〜15:00 前撮り（申請中）
  - 3/15 の 10:00〜13:00 の法要の候補は空いている。14:00 と 15:00 の候補は前撮りで埋まる（場面 0 で「前撮りと重ならない」ことを見せるため）
- ほかの施設: 庭園 11/14・2/11・3/20（確定）、11/21（申請中）。東席 11/22・12/13 午前・1/10（確定）、3/27（申請中）。中席 12/5・1/10・2/20（確定）、12/20（申請中）。西席 12/19（確定）、2/27（申請中）
- 12/6 午前と 12/13 午後は、どの施設にも予約を入れていない（場面 4 の承認で「同じ時間の予約なし」になる）

## 決めること
- ◯×の単位（日ごとの午前・午後とする案。前撮りやお茶会の申請が「午前」「午後」で来るため）と、表示する期間
  - 【決定】案のとおり、日ごとの午前・午後。午前は 0:00〜12:00、午後は 12:00〜24:00（日本時間）とし、その時間帯に申請中か確定の予約が少しでもあれば×にする。理由: 前撮りやお茶会の申請が「午前」「午後」で来るため。1 日を 2 つに分け切ることで、12:00〜13:00 のような予約が◯×から漏れないようにするため
  - 【決定】表示する期間は、今日から 180 日先まで（公開ページは 28 日ずつ。MCP は一度に 62 日まで、ポータルの `getAvailability` は 366 日まで）。理由: 前撮りは数か月前から申し込まれるため、半年先まで見られるようにする
- 申請フォームの日時の入力方法（午前 / 午後 / 時刻の指定）
  - 【決定】「午前（9:00〜12:00）」「午後（13:00〜17:00）」「終日（9:00〜17:00）」「時刻を指定する（8:00〜20:00、30 分刻み）」から選ぶ。理由: 申請の多くは午前・午後で来るので、それを選ぶだけで済むようにし、細かい時間を伝えたい人は時刻を選べるようにするため。午前・午後の申請は、◯×の同じ時間帯の 1 マスだけを×にする
  - 【決定】申請は翌日以降の日だけ受け付ける（当日はお電話で）。電話番号は必須、メールは任意。理由: 当日の申請はお寺が確認できないうちに利用日が来てしまうため。折り返しの連絡に電話を使うため
- 【決定】申請番号は `ABCD-2345` の形（8 文字。数字 2〜9 と英大文字のうち、0/O、1/I/L、U を除いた 30 文字）。入力は小文字、ハイフンなし、全角でも受け付ける。理由: 推測しにくく（約 6500 億通り）、電話で伝えるときに紛らわしい文字がないようにするため。予約ごとに発行する（スタッフが登録した予約や法要の予約にも付く）
- 【決定】MCP の `list_reservations` の「重なりの確認」は、同じ施設（排他制約があるので必ず空）と、同じ時間のほかの施設の予約（法要は `kind = memorial` の予約）を返す。自宅・墓前の法要（施設の予約がない）は見ない。理由: `memorial_*` は 04 のテーブルなので直接読まないため。本堂で行う法要は、必ず本堂の予約を持つ
- 【決定】予約の取り消しは管理画面からだけ（MCP では行わない。spec §4）。法要にひもづく予約は、管理画面の取り消しでは消せない（04 の法要の取り消しから `cancelReservationsByMemorialService` で消す）

## 依頼
（ほかの機能からの変更の依頼を書く）

### 03 から 01 への依頼（統合時に）
- `createContact(actor, tx?, { name, phone?, email? })` を `@/domain/ledger` から提供してほしい。03 は今、`src/domain/facility/ledger-adapter.ts` の仮の関数（`contacts` に insert するだけ）を使っている
- 予約の一覧に申請者の名前を出すため、一般コンタクトをまとめて引く関数（`getContactsByIds(ids)` → `{ id, name, phone, email }`）と、世帯の名前をまとめて引く関数（`getHouseholdNamesByIds(ids)`）もほしい。今はアダプターが `contacts` と `households` を直接読んでいる
- 統合するときは、アダプターの中身を 01 の関数を呼ぶだけにする（ほかのファイルはアダプター経由なので変えなくてよい）

### 統合する人へ（spec.md への反映）
- 上の「決めること」の【決定】を、spec.md §6 の決定事項と §13 の決定ログに反映する（統合で §13 に反映した）

## 完了の条件
- 重なりのチェックのテストが通る
- 台本の**場面 4** を通せる: スマートフォンから 2 件を申請する → 公開ページの◯×が変わる → Claude Desktop で「承認待ちの予約はある？」→ 法要と重ならないことを確かめて承認する
