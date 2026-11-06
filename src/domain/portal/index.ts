// 檀家ポータル（portal）のドメイン層。画面（src/app/portal、src/app/admin/portal）はここから import する。
// ほかの機能からは使われない。
// - 認証: issueInvite、lookupInvite、registerWithInvite、requestLoginLink、consumeLoginLink、getPortalAccount
// - 権限: getPortalContext（窓口 = 世帯の contact_person_id。家族の can_view_household / can_apply_memorial）
// - 家の情報: getPortalFamilyTree、getPortalMemorialSchedule
// - 法要: getMemorialApplyOptions、applyMemorial、listPortalMemorialRequests（04 の関数は memorial-adapter.ts を通す）
// - 家族の権限: listFamilyPermissions、setFamilyPermissions（窓口）、setFamilyPermissionsByStaff（スタッフの代行）
// - 行事と施設: listPortalEvents、getPortalEventForm、submitPortalEvent、listPortalEventResponses、getPortalAvailability
// - 管理画面: listPortalInvites、listInviteCandidates、listPortalAccounts、getPortalAccountForStaff
export * from "./access";
export * from "./admin";
export * from "./auth";
export * from "./codes";
export * from "./events";
export * from "./family";
export * from "./household";
export * from "./memorial";
export * from "./qr";
export * from "./session";
export * from "./tree";
export { LOCATION_LABELS, REQUEST_STATUS_LABELS } from "./common";
export type {
  HouseholdMemorialRequest,
  HouseholdMemorialSchedule,
  MemorialLocation,
  MemorialRequestStatus,
  MemorialServiceView,
  MemorialTargetView,
} from "./memorial-adapter";
