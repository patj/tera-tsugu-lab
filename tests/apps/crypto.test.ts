// お寺のアプリの文書の暗号化（DB を使わない）
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { decryptAppData, encryptAppData } from "@/domain/apps/crypto";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

describe("暗号化", () => {
  it("暗号化して戻せる。暗号文に平文は入らず、毎回変わる", () => {
    const plain = JSON.stringify({ text: "今日はお寺の庭を歩いた" });
    const a = encryptAppData(plain, U1, "a");
    const b = encryptAppData(plain, U1, "a");
    assert.notEqual(a, b);
    assert.ok(!a.includes("お寺"));
    assert.match(a, /^v1:/);
    assert.equal(decryptAppData(a, U1, "a"), plain);
  });

  it("改ざん、別の利用者やアプリへの付け替え、別の鍵では戻せない", () => {
    const c = encryptAppData("秘密", U1, "a");
    const parts = c.split(":");
    const ct = Buffer.from(parts[3], "base64url");
    ct[0] ^= 1;
    assert.throws(() => decryptAppData([parts[0], parts[1], parts[2], ct.toString("base64url")].join(":"), U1, "a"));
    assert.throws(() => decryptAppData(c, U2, "a"));
    assert.throws(() => decryptAppData(c, U1, "b"));
    assert.throws(() => decryptAppData(c, U1, "a", randomBytes(32)));
  });
});
