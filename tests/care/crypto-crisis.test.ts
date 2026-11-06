// ケアの暗号化と危機検知（DB を使わない）
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { decryptCareData, encryptCareData } from "@/domain/care/crypto";
import { containsCrisisKeyword, detectCrisis } from "@/domain/care/crisis";
import { testManifest } from "./fixture";

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";

describe("暗号化", () => {
  it("暗号化して戻せる。暗号文に平文は入らず、毎回変わる", () => {
    const plain = JSON.stringify({ note: "今日はつらかった" });
    const a = encryptCareData(plain, S1, "t");
    const b = encryptCareData(plain, S1, "t");
    assert.notEqual(a, b);
    assert.ok(!a.includes("つらかった"));
    assert.match(a, /^v1:/);
    assert.equal(decryptCareData(a, S1, "t"), plain);
  });

  it("改ざん、別の相談者やツールへの付け替え、別の鍵では戻せない", () => {
    const c = encryptCareData("秘密", S1, "t");
    const parts = c.split(":");
    const ct = Buffer.from(parts[3], "base64url");
    ct[0] ^= 1;
    const tampered = [parts[0], parts[1], parts[2], ct.toString("base64url")].join(":");
    assert.throws(() => decryptCareData(tampered, S1, "t"));
    assert.throws(() => decryptCareData(c, S2, "t"));
    assert.throws(() => decryptCareData(c, S1, "other"));
    assert.throws(() => decryptCareData(c, S1, "t", randomBytes(32)));
  });
});

describe("危機検知", () => {
  it("書き方の揺れ（カタカナ、全角、空白、句読点）があっても検知する", () => {
    for (const s of ["もう死にたい", "シニタイ", "消え て しまいたい", "生きている意味がない。", "ｼﾆﾀｲ", "リスカじゃなくてリストカット", "楽になりたい…"]) {
      assert.ok(containsCrisisKeyword(s), s);
    }
  });

  it("ほかの言葉の一部には当たらない", () => {
    for (const s of ["学校に行きたくない", "悩みを解消したい", "辞書を買った", "今日は楽しかった", "死にものぐるいで働いた"]) {
      assert.ok(!containsCrisisKeyword(s), s);
    }
  });

  it("textarea は必ず対象。choice は crisis: true の項目だけ、選んだ選択肢の言葉で判定する", () => {
    assert.equal(detectCrisis(testManifest, { mood: 3, note: "消えたい" }), true);
    assert.equal(detectCrisis(testManifest, { mood: 3, feeling: "gone" }), true);
    assert.equal(detectCrisis(testManifest, { mood: 3, weather: "die" }), false);
    assert.equal(detectCrisis(testManifest, { mood: 1, feeling: "calm", note: "疲れた" }), false);
  });
});
