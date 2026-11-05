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
- **宗派プリセット**: 日蓮宗（法号、年忌の一覧 `[2, 3, 7, 13, 17, 23, 27, 33, 37, 50]`）
- **検索と取得**
  - `searchHouseholds(actor, query)`（名前、住所、電話）
  - `getHousehold(actor, id)`（家族、故人、直近の対応記録）
  - `searchDeceased(actor, { name?, homyo?, householdId?, relation? })` → 候補の一覧（法号と没年を含む。1 人に絞らない）
  - `getHouseholdMembers(householdId)` → 生きている家族（氏名、カナ、生年月日、性別。05 の `person_list` の自動入力と 06 で使う）
  - `getFamilyTree(householdId)` → 個人と `person_relations`（06 の家系図で使う）
  - `listUpcomingMemorials(actor, { from, to })` → 期間内に年忌を迎える故人を、回忌ごとにまとめた一覧
- **対応記録**: `addContactLog(actor, tx?, { householdId, kind, body })`（06 の「家族の権限の代行」からも使う）

## タスク

### 年忌の計算
- [ ] 上の純粋な関数とテスト。テストに入れる例: 2021 年に亡くなった方の一周忌は 2022 年、三回忌は 2023 年、七回忌は 2027 年（§2）。1 回忌（没年）は年忌に含めない
- [ ] 宗派プリセット（日蓮宗）

### 台帳のドメイン層
- [ ] 世帯、個人、故人の作成と更新（物理削除は作らない。離檀と転出は `households.status`）
- [ ] 世帯主（`head_person_id`）と窓口（`contact_person_id`）の設定。窓口の初期値は世帯主
- [ ] 個人どうしの関係（`person_relations`: parent / spouse）の登録
- [ ] 検索と取得の関数（上のインターフェース）とテスト
- [ ] `listUpcomingMemorials` とテスト（期間が年をまたぐ場合、同じ世帯に複数いる場合）
- [ ] 対応記録の追加

### 管理画面（`/admin/ledger`）
- [ ] 世帯の一覧と検索（名前、住所、電話）。状態（檀家 / 離檀 / 転出）で絞り込む
- [ ] 世帯の詳細: 家族（世帯主と窓口の印）、故人（法号、俗名、没年月日、享年、次の年忌）、対応記録
- [ ] 世帯と個人の編集。世帯主と窓口の変更。個人の関係（親子、配偶者）の編集
- [ ] 故人の一覧（過去帳）と、年忌を迎える故人の一覧（期間を指定する）
- [ ] 対応記録の追加
- [ ] 用語は宗派プリセットから取る（「法号」など）

### MCP（`src/mcp/tools/ledger.ts`）
- [ ] `search_households`（読み取り）
- [ ] `get_household`（読み取り）
- [ ] `search_deceased`（読み取り）
- [ ] `list_upcoming_memorials`（読み取り）。回忌ごとにまとめて返す
- [ ] `add_contact_log`（書き込み。プレビュー → `confirm_action`）

### シード（`src/db/seed/ledger.ts`）
- [ ] 約 30 世帯、故人は約 50 人。法号は「〇〇院日〇信士 / 信女」の形式（§12 E-4）
- [ ] 一般コンタクト（`contacts`）を数件
- [ ] 台本の場面に必要なデータ（07 で台本と突き合わせて直す）
  - **山田家**（場面 0、3）: 父が 2021 年に亡くなっている（2027 年が七回忌）。祥月命日は 3 月の後半にする（3/15 が命日より前になるように）。同じ世帯に、2027 年に別の年忌を迎える故人がいる（複数霊位供養の提案が出るように）。俗名が似た故人がほかの世帯にもいる（故人の確認を求める場面が出るように）
  - **田中家**（場面 2、5）: 2027 年に三回忌を迎える故人がいる（2025 年に亡くなった方）。窓口と家族がいて、親子と配偶者の関係が入っている
  - 撮影日（11 月）から見た「来月」（12 月）に年忌を迎える故人が数人いる（場面 1）
- [ ] 家系図を見せる世帯（田中家、山田家）には `person_relations` を入れる

## 決めること
- 2/29 に亡くなった方の、うるう年でない年の祥月命日（2/28 とする案）
- `list_upcoming_memorials` の基準: 年忌の「年」で数えるか、祥月命日の日付で期間に入るかで数えるか（「来月」と聞かれたときに使うので、祥月命日の日付で判定する案）

## 依頼
（ほかの機能からの変更の依頼を書く）

## 完了の条件
- 年忌の計算のテストが通る
- 管理画面で、世帯、家族、故人、対応記録を見て、直せる
- Claude Desktop で、台本の**場面 1**（来月、年忌を迎えるお家）と**場面 2**（田中家に三回忌のご案内をしたと記録する）を通せる
