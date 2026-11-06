// お寺のアプリの Web App Manifest と、はじめる画面からの戻り先（spec.md §7「全画面とホーム画面」）
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defineAppManifest } from "@/apps-sdk/types";
import { appAssetUrl, buildWebAppManifest, safeAppsReturnPath } from "@/domain/apps/pwa";

const base = defineAppManifest({ id: "heart-closet", name: "心のクローゼット（ベータ版）", description: "服の日記", icon: "👗", sharing: false });

describe("Web App Manifest", () => {
  it("pwa があるアプリだけ作る。開く先はアプリ、アイコンは配信している素材", () => {
    assert.equal(buildWebAppManifest(base), null);
    const m = buildWebAppManifest({ ...base, display: "fullscreen", pwa: { themeColor: "#FBF6EE", backgroundColor: "#FFFFFF", icon: "img/icon-512.png" } });
    assert.deepEqual(m, {
      id: "/apps/heart-closet",
      name: "心のクローゼット（ベータ版）",
      short_name: "心のクローゼット（ベータ",
      description: "服の日記",
      lang: "ja",
      start_url: "/apps/heart-closet",
      scope: "/apps/",
      display: "standalone",
      background_color: "#FFFFFF",
      theme_color: "#FBF6EE",
      icons: [{ src: "/app-assets/heart-closet/img/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }],
    });
  });

  it("素材のパスは、素材のディレクトリの外を指せない", () => {
    assert.equal(appAssetUrl("a", "./img/x y.png"), "/app-assets/a/img/x%20y.png");
    assert.throws(() => appAssetUrl("a", "../../.env"));
    assert.throws(() => appAssetUrl("a", ""));
  });
});

describe("はじめる画面からの戻り先", () => {
  it("/apps/<app-id> の形だけを許す（ほかのサイトや別の画面には移さない）", () => {
    assert.equal(safeAppsReturnPath("/apps/heart-closet"), "/apps/heart-closet");
    for (const bad of ["//evil.example", "https://evil.example/apps/x", "/admin", "/apps/x/../../admin", "/apps/x/sharing", "/apps/X", "", null, 1]) {
      assert.equal(safeAppsReturnPath(bad), null, String(bad));
    }
  });
});
