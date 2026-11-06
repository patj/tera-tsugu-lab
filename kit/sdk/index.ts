// お寺のアプリ用の SDK（開発キット版）。アプリは、ここ（@/apps-sdk）だけを import できる（apps/CLAUDE.md）。
// 型（types.ts）は本体と同じもの。useAppStorage / useAppSharing は本体と同じ形で、保存先だけがブラウザの中（試すためだけ）
export * from "./types";
export { useAppSharing, useAppStorage } from "./storage";
