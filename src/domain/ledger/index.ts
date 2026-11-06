// 台帳（ledger）のドメイン層。ほかの機能はここから import する（docs/tasks/01-ledger.md「提供するインターフェース」）。
//
// 年忌の計算（純粋な関数）: kaikiOfYear、yearOfKaiki、kaikiName、shoutsukiMeinichi、isMemorialKaiki、
//   memorialInYear、memorialsBetweenYears、nextMemorial
// 検索と取得: searchHouseholds、getHousehold、searchDeceased、getHouseholdMembers、getHouseholdBasics、
//   getFamilyTree、listUpcomingMemorials、getPerson
// 書き込み: createHousehold、updateHousehold、setHouseholdRoles、createPerson、updatePerson、addRelation、
//   removeRelation、addContactLog、createContact
export * from "./kaiki";
export {
  CONTACT_LOG_KINDS,
  GENDER_LABELS,
  HOUSEHOLD_STATUSES,
  HOUSEHOLD_STATUS_LABELS,
  type Gender,
  type HouseholdStatus,
  type RelationKind,
} from "./common";
export {
  createHousehold,
  getHousehold,
  getHouseholdBasics,
  getHouseholdMembers,
  searchHouseholds,
  setHouseholdRoles,
  updateHousehold,
  type ContactLogEntry,
  type DeceasedEntry,
  type GetHouseholdOptions,
  type HouseholdBasics,
  type HouseholdDetail,
  type HouseholdInput,
  type HouseholdMember,
  type HouseholdMemberEntry,
  type HouseholdSummary,
  type SearchHouseholdsOptions,
} from "./households";
export {
  createPerson,
  getPerson,
  searchDeceased,
  updatePerson,
  type DeceasedCandidate,
  type DeceasedSearch,
  type PersonDetail,
  type PersonInput,
} from "./persons";
export {
  addRelation,
  getFamilyTree,
  listRelationsOf,
  removeRelation,
  type FamilyTree,
  type FamilyTreePerson,
  type FamilyTreeRelation,
  type RelationEntry,
} from "./relations";
export {
  addContactLog,
  createContact,
  getContactById,
  listContactLogs,
  listContacts,
  type AddContactLogInput,
  type Contact,
  type CreateContactInput,
} from "./contacts";
export {
  listUpcomingMemorials,
  type UpcomingMemorialGroup,
  type UpcomingMemorialItem,
  type UpcomingMemorials,
} from "./memorials";
