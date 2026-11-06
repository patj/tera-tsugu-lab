# 01 檀家管理コア（台帳）

> 段階 1。00 が終わったら始める。**削らない**（台本の場面 0〜2 の土台）。
> 仕様: spec.md §2、§9（households、persons、person_relations、contacts、contact_logs）

## 担当する範囲
- `src/domain/ledger/`、`src/db/schema/ledger.ts`、`src/db/seed/ledger.ts`
- `src/mcp/tools/ledger.ts`
- `src/app/admin/ledger/`
- `tests/ledger/`

## 依存先
- 00 基盤

## 提供するインターフェース
**最初に作ってコミットする**（04、05、06 が使う）。

- **年忌の計算**（純粋な関数。DB を使わない）
  - `kaikiOfYear(deathDate, year)` → その年が何回忌か（没年が 1）
  - `yearOfKaiki(deathDate, n)` → n 回忌の年（没年 + n − 1）
  - `kaikiName(n, preset)` → 「一周忌」「七回忌」などの呼び名
  - `shoutsukiMeinichi(deathDate, year)` → その年の祥月命日
  - `isMemorialKaiki(n, preset)` → 宗派プリセットの年忌の一覧に入っているか
- **宗派プリセット**: 型と日蓮宗の中身（法号、年忌の一覧 `[2, 3, 7, 13, 17, 23, 27, 33, 37, 50]`、複数霊位供養の呼び方）は、00 が `src/domain/core/sect.ts` に作った。01 はそれを使う
- **検索と取得**
  - `searchHouseholds(actor, query)`（名前、住所、電話）
  - `getHousehold(actor, id)`（家族、故人、直近の対応記録）
  - `searchDeceased(actor, { name?, homyo?, householdId?, relation? })` → 候補の一覧（法号と没年を含む。1 人に絞らない）
  - `getHouseholdMembers(householdId)` → 生きている家族（氏名、カナ、生年月日、性別。05 の `person_list` の自動入力と 06 で使う）
  - `getFamilyTree(householdId)` → 個人と `person_relations`（06 の家系図で使う）
  - `listUpcomingMemorials(actor, { from, to })` → 期間内に年忌を迎える故人を、回忌ごとにまとめた一覧
- **対応記録**: `addContactLog(actor, tx?, { householdId, kind, body })`（06 の「家族の権限の代行」からも使う）
- **一般コンタクト**: `createContact(actor, tx?, { name, phone?, email? })`（03 の公開の申請フォームが使う）

**実装したもの**（すべて `@/domain/ledger` から import する。日付は "YYYY-MM-DD" の文字列。`conn` を省略すると `db`）
- 年忌の計算: `kaikiOfYear(deathDate, year)`、`yearOfKaiki(deathDate, n)`、`kaikiName(n, preset?)`、`shoutsukiMeinichi(deathDate, year)` → "YYYY-MM-DD"、`isMemorialKaiki(n, preset)`。`deathDate` は "YYYY-MM-DD" か Date
  - 追加: `memorialInYear(deathDate, year, preset)` → その年の年忌 `{ kaiki, kaikiName, year, meinichi }` か null、`memorialsBetweenYears(deathDate, fromYear, toYear, preset)`、`nextMemorial(deathDate, today, preset)`（04 の `suggestKaiki` や `getHouseholdMemorialSchedule` に使える）
- `searchHouseholds(actor, query, { status?, limit? }?, conn?)` → 世帯主と窓口つきの一覧（スタッフだけ）
- `getHousehold(actor, id, { today?, contactLogLimit? }?, conn?)` → 住所と電話、世帯主と窓口、`members`（生きている家族）、`deceased`（法号、没年月日、享年、`nextMemorial`）、`contactLogs`
- `searchDeceased(actor, { name?, homyo?, householdId?, relation?, query?, status?, limit?, today? }, conn?)` → 候補の一覧（法号、没年月日、没年、享年、続柄、世帯、次の年忌）
- `getHouseholdMembers(householdId, conn?)` → 生きている家族（氏名、姓、名、カナ、生年月日、性別、続柄、世帯主か、窓口か）。操作者は受け取らない
- `getHouseholdBasics(householdId, conn?)` → 世帯の名前、郵便番号、住所、固定電話、状態、`headPersonId`、`contactPersonId`（05 の自動入力、06 の窓口の判定に使う。操作者は受け取らない）
- `getFamilyTree(householdId, conn?)` → `{ persons, relations }`。関係でつながったほかの世帯の人も `inHousehold: false` で入る。配偶者は 1 組に 1 行
- `listUpcomingMemorials(actor, { from, to }, conn?)` → `{ total, groups: [{ kaiki, kaikiName, count, items }] }`。各 item に `sameYearInHousehold`（複数霊位供養の候補）
- `addContactLog(actor, input)` / `addContactLog(actor, tx, input)`（`input = { householdId, kind, body }`。記録者は操作者のスタッフ）
- `createContact(actor, input)` / `createContact(actor, tx, input)`（公開の申請フォームからは `systemActor(templeId)` で呼んでよい）、`getContactById(id)`、`listContacts(actor)`
- 台帳の編集（管理画面が使う）: `createHousehold`、`updateHousehold`、`setHouseholdRoles`、`createPerson`、`updatePerson`、`getPerson`、`addRelation`、`removeRelation`、`listContactLogs`

## タスク

### 年忌の計算
- [x] 上の純粋な関数とテスト。テストに入れる例: 2021 年に亡くなった方の一周忌は 2022 年、三回忌は 2023 年、七回忌は 2027 年（§2）。1 回忌（没年）は年忌に含めない

### 台帳のドメイン層
- [x] 世帯、個人、故人の作成と更新（物理削除は作らない。離檀と転出は `households.status`）
- [x] 世帯主（`head_person_id`）と窓口（`contact_person_id`）の設定。窓口の初期値は世帯主
- [x] 個人どうしの関係（`person_relations`: parent / spouse）の登録
- [x] 検索と取得の関数（上のインターフェース）とテスト
- [x] `listUpcomingMemorials` とテスト（期間が年をまたぐ場合、同じ世帯に複数いる場合）
- [x] 対応記録の追加

### 管理画面（`/admin/ledger`）
- [x] 世帯の一覧と検索（名前、住所、電話）。状態（檀家 / 離檀 / 転出）で絞り込む
- [x] 世帯の詳細: 家族（世帯主と窓口の印）、故人（法号、俗名、没年月日、享年、次の年忌）、対応記録
- [x] 世帯と個人の編集。世帯主と窓口の変更。個人の関係（親子、配偶者）の編集
- [x] 故人の一覧（過去帳）と、年忌を迎える故人の一覧（期間を指定する）
- [x] 対応記録の追加
- [x] 用語は宗派プリセットから取る（「法号」など）
- [x] 年忌を迎える故人の一覧（`/admin/ledger/memorials`）を、回忌（`?kaiki=3`）でも絞れるようにする（MCP の `list_upcoming_memorials` が URL を返すため）
- [x] 【後にしてよい】世帯にお墓の場所（住所。境内の墓地なら空）を足す。スキーマ、世帯の編集と詳細の画面、シード（墓前の法要に使う世帯に入れる）（spec.md §2）

### MCP（`src/mcp/tools/ledger.ts`）
- [x] `search_households`（読み取り）
- [x] `get_household`（読み取り）
- [x] `search_deceased`（読み取り）
- [x] `list_upcoming_memorials`（読み取り）。回忌ごとにまとめて返す
- [x] `add_contact_log`（書き込み。プレビュー → `confirm_action`）
- [x] 名前を LLM に返さない（spec.md §4「LLM に渡す情報」、11/6 の決定）
  - `search_households`: 検索語と家の名前が合う家だけ、家の名前と町名を返す。町名・電話番号・家族の名前で当たった家は、件数と URL だけ。世帯主と窓口の名前は返さない
  - `get_household`: 家の名前、家族と故人の名前、法号を返さない。家族は続柄と世帯主・窓口の印、故人は続柄・没年・次の年忌
  - `search_deceased`: 候補を町名・続柄・没年・次の年忌で返す。家の名前は検索語と合うときだけ
  - `list_upcoming_memorials`: 回忌（`kaiki`）でも絞れるようにする。回忌ごとの人数、月、目印（複数霊位供養の候補、祥月命日を過ぎた）、ID、管理画面の一覧の URL（期間と回忌で絞ったもの）を返し、名前は返さない
  - `add_contact_log`: プレビューは「町名の世帯」、種類、内容、URL（家の名前は入れない）
  - 説明文: 名前は管理画面で見てもらうこと、住職が言った名前は会話で使ってよいことを書く

### シード（`src/db/seed/ledger.ts`）
- [x] 約 30 世帯、故人は約 50 人。法号は「〇〇院日〇信士 / 信女」の形式（§12 E-4）
- [x] 一般コンタクト（`contacts`）を数件
- [x] 台本の場面に必要なデータ（07 で台本と突き合わせて直す）
  - **山田家**（場面 0、3）: 父が 2021 年に亡くなっている（2027 年が七回忌）。祥月命日は 3 月の後半にする（3/15 が命日より前になるように）。同じ世帯に、2027 年に別の年忌を迎える故人がいる（複数霊位供養の提案が出るように）。俗名が似た故人がほかの世帯にもいる（故人の確認を求める場面が出るように）
  - **田中家**（場面 2、5）: 2027 年に三回忌を迎える故人がいる（2025 年に亡くなった方）。窓口と家族がいて、親子と配偶者の関係が入っている
  - 撮影日（11 月）から見た「来月」（12 月）に年忌を迎える故人が数人いる（場面 1）
- [x] 家系図を見せる世帯（田中家、山田家）には `person_relations` を入れる

## 決めること
- 2/29 に亡くなった方の、うるう年でない年の祥月命日（2/28 とする案）
  - 【決定】案のとおり 2/28 とする。3/1 にすると「命日より後の日」の判定（04）で、2/28 の法要が命日より前と扱われてしまい、繰り上げの慣習とも合わないため（`shoutsukiMeinichi`）
- `list_upcoming_memorials` の基準: 年忌の「年」で数えるか、祥月命日の日付で期間に入るかで数えるか（「来月」と聞かれたときに使うので、祥月命日の日付で判定する案）
  - 【決定】案のとおり、その年の祥月命日が期間 [from, to]（両端を含む）に入る故人を数える。「来月」と聞かれる使い方に合うため。年をまたぐ期間も受け付ける（3 年まで）
- 実装しながら決めたこと（spec.md にはない。統合するときに反映を判断する）
  - 【決定】`list_upcoming_memorials` には離檀・転出の世帯の故人を含めない。年忌のご案内をする相手ではないため。過去帳（`searchDeceased`）には含める
  - 【決定】`list_upcoming_memorials` の各故人に、同じ世帯で同じ年に年忌を迎えるほかの故人（`sameYearInHousehold`）をつける。場面 1 の一覧から複数霊位供養を提案できるようにするため
  - 【決定】「次の年忌」は、祥月命日が今日以降になる、いちばん近い年忌とする（`nextMemorial`）。祥月命日の当日は含める
  - 【決定】配偶者の関係（`person_relations` の spouse）は 1 組に 1 行だけ持つ（向きに意味はない）。親子は「子 → 親」の向きに 1 行。逆向きや重複は登録できない
  - 【決定】ポータルの操作者（`portalActor`）は、`getHousehold`・`getPerson`・`searchDeceased` で自分の世帯だけを読める。対応記録は返さない（お寺の内部の記録のため）。台帳の編集と `searchHouseholds` はスタッフだけ。家族の権限（`can_view_household`）の判定は 06 が行う
  - 【決定】世帯主と窓口は、その世帯の生きている人だけにできる。世帯主・窓口の人を故人にするときは、先に世帯主・窓口を変える。世帯に世帯主がいないときは、最初に登録した生きている人を世帯主と窓口にする
  - 【決定】対応記録の種類は「案内 / 電話 / 来寺 / その他」（MCP ではこの中から選ぶ。ドメイン層は 20 文字までの文字列を受け付ける）
  - 【決定】一般コンタクト（`createContact`）は、電話かメールのどちらかを必須にする
  - 【決定】享年はシードでは満年齢で入れる。画面では手で入力する（数え年で入れてもよい）

## シードの名前
`src/db/seed/ledger.ts`。ほかの機能のシードは `ctx.get("<名前>")` で ID を取る。

- 世帯: `household:yamada`（山田家・本町）、`household:yamada_kita`（もう 1 つの山田家・北町）、`household:tanaka`、`household:sato`、`household:suzuki`、`household:ito`、`household:watanabe`、`household:nakamura`、`household:kobayashi`、`household:kato`（離檀）、`household:yoshida`、自動で作る 19 世帯 `household:takagi`、`matsumoto`、`inoue`、`kimura`、`hayashi`、`shimizu`、`yamaguchi`、`mori`、`ikeda`、`hashimoto`、`abe`、`ishikawa`、`maeda`、`fujii`、`goto`、`okamoto`、`hasegawa`、`murakami`、`kondo`（転出）
- 個人: `person:<世帯>:<役>`。役は世帯主から見た立場（`head`、`wife`、`mother`、`father`、`grandfather` など）
  - 山田家: `person:yamada:head`（山田 健。窓口も）、`:mother`（幸子）、`:wife`（由美）、`:daughter`（さくら）、`:son`（翔太）、故人 `:father`（太郎）、`:grandmother`（キヨ）、`:grandfather`（清）
  - 北町の山田家: `person:yamada_kita:head`（修）、`:wife`（恵子）、故人 `:father`（太一）
  - 田中家: `person:tanaka:head`（一郎。世帯主）、`:son`（健一。**窓口**）、`:son_wife`（美咲）、`:grandchild`（陽菜）、故人 `:wife`（和子）、`:father`（正雄）、`:mother`（ヨシ）
  - そのほかの世帯: `person:<世帯>:head` はすべての世帯にある。故人は `:father`、`:mother`、`:grandfather` など
- 一般コンタクト: `contact:morikawa`、`contact:ogawa`、`contact:aoki`、`contact:nomura`

台本のための主なデータ（2026-11 の撮影日から見る）

| 世帯 | 故人（法号） | 没年月日 | 年忌 | 台本 |
|---|---|---|---|---|
| 山田家 | 父 山田 太郎（慈光院日太信士） | 2021-03-24（享年 82） | 2027 年 七回忌。祥月命日 3/24 は 3/15 より後 | 場面 0 |
| 山田家 | 祖母 山田 キヨ（妙香院日喜信女） | 2015-08-10 | 2027 年 十三回忌（複数霊位供養の提案） | 場面 0 |
| 山田家 | 祖父 山田 清（寿量院日清信士） | 1990-12-05 | 2026-12 三十七回忌 | 場面 1 |
| 北町の山田家 | 父 山田 太一（慈雲院日一信士） | 2018-03-02 | 2027 年は十回忌で年忌ではない。「山田」「父」で検索すると太郎と並ぶ | 場面 0 |
| 田中家 | 妻 田中 和子（蓮華院日和信女） | 2025-04-12 | 2027 年 三回忌（2026 年の一周忌は済み。対応記録あり） | 場面 2、5 |
| 佐藤家 | 父 佐藤 茂 / 母 佐藤 キミ | 2020-12-18 / 2024-12-28 | 2026-12 七回忌 / 三回忌（同じ世帯に 2 人） | 場面 1 |
| 鈴木家 | 母 鈴木 ハナ | 2025-12-02 | 2026-12 一周忌 | 場面 1 |
| 伊藤家 | 父 伊藤 勝 | 2014-12-20 | 2026-12 十三回忌 | 場面 1 |
| 渡辺家 | 母 渡辺 トメ | 1994-12-11 | 2026-12 三十三回忌 | 場面 1 |

- 2026 年 12 月に年忌を迎えるのは上の 6 人（場面 1）。境目の確認用に、中村家（2026-11-30 七回忌）、小林家（2027-01-03 十三回忌）、加藤家（離檀。2026-12 七回忌）、吉田家（2026-12 だが八回忌）がある
- 「田中」で検索すると 1 世帯、「山田」では 2 世帯になる（自動で作る世帯に、山田・田中の名字と「田中」を含む住所は使わない。12 月の没年月日も使わない）
- 家系図の関係は、すべての台本の世帯（山田家、田中家など）と自動の世帯（配偶者と親子）に入れた
- これらの条件は `tests/ledger/seed.test.ts` で確かめている

## 依頼
（ほかの機能からの変更の依頼を書く）

## 完了の条件
- 年忌の計算のテストが通る
- 管理画面で、世帯、家族、故人、対応記録を見て、直せる
- Claude Desktop で、台本の**場面 1**（来月、年忌を迎えるお家）と**場面 2**（田中家に三回忌のご案内をしたと記録する）を通せる
- 確認の状況: 場面 1 と 2 は Claude Desktop ではまだ通していない。代わりに `tests/ledger/mcp-scenario.test.ts` で、`ToolRuntime` からツールを呼ぶ流れ（`list_upcoming_memorials` に 2026-12 を渡す、`search_households` → `get_household` → `add_contact_log` → `confirm_action`）を確かめた。Claude Desktop での確認は 07 で行う
