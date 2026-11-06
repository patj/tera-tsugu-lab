// スタッフのカレンダー（calendar）のドメイン層。ほかの機能はここから import する。
//
// 04（法要の受付）が使うもの:
//   listOfficiants(templeId, conn?)                       法要の担当者（is_officiant）のスタッフ
//   getStaffBusyIntervals(staffIds, { from, to }, conn?)  スタッフごとの埋まっている時間（私的な予定も含む。内容は返さない）
//   createSharedEvent(actor, tx, { category, title, body, start, end, assigneeStaffIds, memorialServiceId? })
//   cancelEventsByMemorialService(actor, tx, memorialServiceId)
//   getCalendar(actor, { from, to, staffIds? })           表示用。他人の私的な予定は時間と「予定あり」だけ
export * from "./availability";
export * from "./events";
export * from "./types";
