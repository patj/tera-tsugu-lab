// 法要の受付（memorial）のドメイン層。ほかの機能はここから import する（docs/tasks/04-memorial.md）。
//
// 06 のポータルが使うもの:
//   createMemorialRequest(actor, input)            ポータルからの申し込み（source = portal、状態 requested）
//   listMemorialRequestsForHousehold(householdId)  世帯の申し込みの一覧（新しい順）
//   getHouseholdMemorialSchedule(householdId)      確定した法要と、今後の年忌の目安
//   suggestKaiki(personId, year)                   申し込みフォームの回忌の提案
export * from "./types";
export * from "./requests";
export * from "./schedule";
//
// スタッフ（管理画面、MCP）が使うもの:
//   verifyMemorial（年忌の検証）、findMemorialSlots（候補の日時）、planMemorialBooking / bookMemorialService（確定）、
//   cancelMemorialService（取り消し。管理画面だけ）、listMemorialServices / getMemorialService、
//   listMemorialRequests / getMemorialRequest / declineMemorialRequest
export * from "./verify";
export * from "./slots";
export * from "./services";
