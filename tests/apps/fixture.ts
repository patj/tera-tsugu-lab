// お寺のアプリのテストで使う、テスト用のアプリ（apps/ には置かない。setAppsForTesting で差し込む）
import { defineAppManifest, type AppDefinition } from "@/apps-sdk";

export const DIARY = "test-diary";
export const FORTUNE = "test-fortune";
/** 1 件ずつの共有（sharing: "perDoc"） */
export const JOURNAL = "test-journal";

export const TEST_APPS: AppDefinition[] = [
  { manifest: defineAppManifest({ id: DIARY, name: "テストの日記", description: "テスト用", icon: "📓", sharing: true }) },
  { manifest: defineAppManifest({ id: FORTUNE, name: "テストの占い", description: "テスト用", icon: "🔮", sharing: false }) },
  { manifest: defineAppManifest({ id: JOURNAL, name: "テストの日誌", description: "テスト用", icon: "📔", sharing: "perDoc" }) },
];
