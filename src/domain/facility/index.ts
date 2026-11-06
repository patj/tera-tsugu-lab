// 施設予約（facility）のドメイン層。ほかの機能はここから import する。
//
// 提供するインターフェース（docs/tasks/03-facility.md）:
// - getFacilityBusyIntervals(facilityId, { from, to }, conn?)   … 申請中と確定の予約の時間（04）
// - createReservation(actor, tx, { facilityId, kind, status, start, end, ... }) … 重なれば conflict（04 が法要の確定で呼ぶ）
// - cancelReservationsByMemorialService(actor, tx, memorialServiceId) … 法要の取り消し（04）
// - getAvailability({ from, to, templeId? })                   … 施設ごとの◯×（06 のポータル、公開ページ）
// - getMainHallId(templeId) / listFacilities(templeId)         … 本堂の ID、施設の一覧（04）
export * from "./availability";
export * from "./constants";
export * from "./facilities";
export * from "./public";
export * from "./request-code";
export * from "./reservations";
