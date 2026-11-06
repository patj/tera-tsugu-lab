// ケアのツール（プラグイン）用の SDK。プラグインは、ここ（@/care-sdk）だけを import できる（tools/CLAUDE.md）。
// DB に依存しない。データの読み書き、同意、暗号化、監査ログ、危機検知は本体（src/domain/care/）が担う。spec.md §7
export * from "./types";
export * from "./resources";
export { CareDisclaimer, CareEntryForm, CareEntryList, CrisisResources, formatCareDate, formatCareValue } from "./components";
