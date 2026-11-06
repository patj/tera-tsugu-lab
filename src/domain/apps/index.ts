// お寺のアプリ（apps）のドメイン層。spec.md §7
// 利用者の画面（src/app/apps/）と管理画面（src/app/admin/apps/）だけから呼ぶ。MCP から呼んではいけない
// （呼んでも、すべての関数が MCP の操作者を拒否する）。文書の本文を、監査ログ、エラー、console に出さない。
export * from "./admin";
export * from "./documents";
export * from "./guard";
export * from "./registry";
export * from "./sharing";
export * from "./users";
export * from "./ai";
export * from "./pwa";
