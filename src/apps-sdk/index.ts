// お寺のアプリ用の SDK。アプリは、ここ（@/apps-sdk）だけを import できる（apps/CLAUDE.md）。
// DB に依存しない。保存、暗号化、共有の履歴、監査ログは本体（src/domain/apps/）が受け持つ。spec.md §7
export * from "./types";
export { useAppSharing, useAppStorage } from "./storage";
export { useAppAI } from "./ai-client";
export { useAppAssets } from "./assets";
