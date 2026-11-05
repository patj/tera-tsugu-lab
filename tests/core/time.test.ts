import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  eachDate,
  formatJst,
  freeIntervals,
  isFree,
  jst,
  jstDateString,
  jstTimeString,
  mergeIntervals,
  overlaps,
  parseJstDateTime,
  type Interval,
} from "@/domain/core/time";

const iv = (d: string, s: string, e: string): Interval => ({ start: jst(d, s), end: jst(d, e) });
const show = (list: Interval[]) => list.map((i) => `${jstTimeString(i.start)}-${jstTimeString(i.end)}`);

describe("日本時間", () => {
  it("jst は日本時間の日時を作る", () => {
    assert.equal(jst("2027-03-15", "10:00").toISOString(), "2027-03-15T01:00:00.000Z");
  });
  it("日本時間の 0:00〜8:59 は、UTC では前の日になるが、日付は日本時間で返す", () => {
    const d = jst("2027-03-15", "00:30");
    assert.equal(d.toISOString().slice(0, 10), "2027-03-14");
    assert.equal(jstDateString(d), "2027-03-15");
  });
  it("formatJst は曜日つきで表示する", () => {
    assert.equal(formatJst(jst("2027-03-15", "10:00")), "2027-03-15（月）10:00");
  });
  it("parseJstDateTime はタイムゾーンがなければ日本時間とみなす", () => {
    assert.equal(parseJstDateTime("2027-03-15 10:00").getTime(), jst("2027-03-15", "10:00").getTime());
    assert.equal(parseJstDateTime("2027-03-15T10:00").getTime(), jst("2027-03-15", "10:00").getTime());
    assert.equal(parseJstDateTime("2027-03-15").getTime(), jst("2027-03-15").getTime());
    assert.equal(parseJstDateTime("2027-03-15T01:00:00Z").getTime(), jst("2027-03-15", "10:00").getTime());
  });
  it("存在しない日付と、形の違う文字列は拒否する", () => {
    assert.throws(() => jst("2027-02-29"));
    assert.throws(() => parseJstDateTime("3/15 10時"));
  });
  it("addDays と eachDate は月と年をまたげる", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.deepEqual(eachDate("2026-12-30", "2027-01-02"), ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});

describe("区間", () => {
  it("端がちょうど接する区間は重ならない", () => {
    assert.equal(overlaps(iv("2027-03-15", "10:00", "11:00"), iv("2027-03-15", "11:00", "12:00")), false);
    assert.equal(overlaps(iv("2027-03-15", "10:00", "11:01"), iv("2027-03-15", "11:00", "12:00")), true);
  });
  it("含まれる区間は重なる", () => {
    assert.equal(overlaps(iv("2027-03-15", "09:00", "17:00"), iv("2027-03-15", "10:00", "10:30")), true);
  });
  it("isFree は一覧のどれとも重ならないかを返す", () => {
    const busy = [iv("2027-03-15", "10:00", "11:00"), iv("2027-03-15", "13:00", "14:00")];
    assert.equal(isFree(iv("2027-03-15", "11:00", "13:00"), busy), true);
    assert.equal(isFree(iv("2027-03-15", "12:30", "13:30"), busy), false);
  });
  it("mergeIntervals は重なりと接する区間をまとめる", () => {
    const merged = mergeIntervals([
      iv("2027-03-15", "13:00", "14:00"),
      iv("2027-03-15", "10:00", "11:00"),
      iv("2027-03-15", "11:00", "12:00"),
      iv("2027-03-15", "10:30", "10:45"),
    ]);
    assert.deepEqual(show(merged), ["10:00-12:00", "13:00-14:00"]);
  });
  it("freeIntervals は範囲の中の空いている時間を返す", () => {
    const range = iv("2027-03-15", "09:00", "17:00");
    const busy = [
      iv("2027-03-15", "08:00", "09:30"),
      iv("2027-03-15", "12:00", "13:00"),
      iv("2027-03-15", "16:30", "18:00"),
    ];
    assert.deepEqual(show(freeIntervals(range, busy)), ["09:30-12:00", "13:00-16:30"]);
  });
  it("freeIntervals は、予定がなければ範囲全体、全部埋まっていれば空を返す", () => {
    const range = iv("2027-03-15", "09:00", "17:00");
    assert.deepEqual(show(freeIntervals(range, [])), ["09:00-17:00"]);
    assert.deepEqual(freeIntervals(range, [iv("2027-03-15", "08:00", "18:00")]), []);
  });
  it("日をまたぐ区間も扱える", () => {
    const night = { start: jst("2027-03-15", "22:00"), end: jst("2027-03-16", "02:00") };
    assert.equal(overlaps(night, iv("2027-03-16", "01:00", "03:00")), true);
    assert.equal(overlaps(night, iv("2027-03-16", "02:00", "03:00")), false);
  });
});
