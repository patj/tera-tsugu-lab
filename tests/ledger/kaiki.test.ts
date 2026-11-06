import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSectPreset } from "@/domain/core/sect";
import {
  isMemorialKaiki,
  kaikiName,
  kaikiOfYear,
  memorialInYear,
  memorialsBetweenYears,
  nextMemorial,
  shoutsukiMeinichi,
  toKanjiNumber,
  yearOfKaiki,
} from "@/domain/ledger";

const nichiren = getSectPreset("nichiren");

describe("年忌の計算", () => {
  it("没年を 1 回忌として数える（§2 の例: 2021 年に亡くなった方）", () => {
    assert.equal(kaikiOfYear("2021-03-24", 2021), 1);
    assert.equal(kaikiOfYear("2021-03-24", 2022), 2); // 一周忌
    assert.equal(kaikiOfYear("2021-03-24", 2023), 3); // 三回忌
    assert.equal(kaikiOfYear("2021-03-24", 2027), 7); // 七回忌
    assert.equal(kaikiOfYear("2021-03-24", 2020), 0);
  });

  it("n 回忌の年は 没年 + n − 1", () => {
    assert.equal(yearOfKaiki("2021-03-24", 2), 2022);
    assert.equal(yearOfKaiki("2021-03-24", 3), 2023);
    assert.equal(yearOfKaiki("2021-03-24", 7), 2027);
    assert.equal(yearOfKaiki("2021-03-24", 50), 2070);
    assert.throws(() => yearOfKaiki("2021-03-24", 0));
  });

  it("Date でも受け取る（日本時間の日付として扱う）", () => {
    // 2021-03-23T15:00Z は日本時間で 2021-03-24 0:00
    assert.equal(kaikiOfYear(new Date("2020-12-31T15:00:00Z"), 2027), 7);
    assert.equal(shoutsukiMeinichi(new Date("2021-03-23T15:00:00Z"), 2027), "2027-03-24");
  });

  it("呼び名: 2 は一周忌、ほかは漢数字の回忌", () => {
    assert.equal(kaikiName(2, nichiren), "一周忌");
    assert.equal(kaikiName(3), "三回忌");
    assert.equal(kaikiName(7), "七回忌");
    assert.equal(kaikiName(13), "十三回忌");
    assert.equal(kaikiName(23), "二十三回忌");
    assert.equal(kaikiName(37), "三十七回忌");
    assert.equal(kaikiName(50), "五十回忌");
    assert.equal(toKanjiNumber(100), "百");
    assert.equal(toKanjiNumber(110), "百十");
  });

  it("年忌の一覧（日蓮宗）。1 回忌（没年）は年忌に含めない", () => {
    for (const n of [2, 3, 7, 13, 17, 23, 27, 33, 37, 50]) assert.equal(isMemorialKaiki(n, nichiren), true, `${n}`);
    for (const n of [1, 4, 5, 6, 8, 49]) assert.equal(isMemorialKaiki(n, nichiren), false, `${n}`);
    assert.equal(memorialInYear("2021-03-24", 2021, nichiren), null);
    assert.equal(memorialInYear("2021-03-24", 2024, nichiren), null);
    assert.deepEqual(memorialInYear("2021-03-24", 2027, nichiren), {
      kaiki: 7,
      kaikiName: "七回忌",
      year: 2027,
      meinichi: "2027-03-24",
    });
  });

  it("祥月命日は亡くなった月日。2/29 はうるう年でない年は 2/28", () => {
    assert.equal(shoutsukiMeinichi("2021-03-24", 2027), "2027-03-24");
    assert.equal(shoutsukiMeinichi("2020-02-29", 2021), "2021-02-28");
    assert.equal(shoutsukiMeinichi("2020-02-29", 2024), "2024-02-29");
    assert.equal(shoutsukiMeinichi("2020-02-29", 2100), "2100-02-28");
    assert.equal(shoutsukiMeinichi("2020-02-29", 2000), "2000-02-29");
  });

  it("期間の年忌の一覧と、次の年忌", () => {
    assert.deepEqual(
      memorialsBetweenYears("2021-03-24", 2022, 2033, nichiren).map((m) => `${m.year}:${m.kaikiName}`),
      ["2022:一周忌", "2023:三回忌", "2027:七回忌", "2033:十三回忌"],
    );
    assert.equal(nextMemorial("2021-03-24", "2026-11-06", nichiren)?.kaikiName, "七回忌");
    // 祥月命日の当日は「次の年忌」に入る。過ぎたら次へ
    assert.equal(nextMemorial("2021-03-24", "2027-03-24", nichiren)?.year, 2027);
    assert.equal(nextMemorial("2021-03-24", "2027-03-25", nichiren)?.kaikiName, "十三回忌");
    // 亡くなった年のうちは一周忌が次
    assert.equal(nextMemorial("2026-10-01", "2026-11-06", nichiren)?.kaikiName, "一周忌");
    // 五十回忌を終えていれば null
    assert.equal(nextMemorial("1950-01-01", "2026-11-06", nichiren), null);
  });
});
