// メンタルケア（care）のドメイン層。spec.md §7
// ケアのポータル（src/app/care/）と管理画面（src/app/admin/care/）だけから呼ぶ。MCP から呼んではいけない
// （呼んでも、すべての関数が MCP の操作者を拒否する）。記録の本文を、監査ログ、エラー、console に出さない。
export * from "./admin";
export * from "./consent";
export * from "./crisis";
export * from "./entries";
export * from "./guard";
export * from "./subjects";
export * from "./tools";
