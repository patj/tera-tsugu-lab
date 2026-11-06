// 行事への申し込み（05 のフォームを source = "portal" で回答する）と、施設の空き状況（03 の◯×）
// - 回答者と世帯は、操作者の本人から決める（05 の submitResponse も確かめる）
// - person_list は、家族を選ぶだけで台帳の項目（カナ、氏名、生年月日、性別）が入る（05 が補う）
// - 申し込みの確認: 本人の申し込みは誰でも、世帯の申し込み（個別リンクを含む）は窓口だけ
import { db, type DbOrTx } from "@/db/client";
import { addDays, invalid, notFound, parseDateString, todayJst, type Actor } from "@/domain/core";
import { getAvailability, type Availability } from "@/domain/facility";
import {
  getFormForRespondent,
  listOpenFormsForPortal,
  listResponsesOfHousehold,
  listResponsesOfPerson,
  submitResponse,
  type Answers,
  type MyResponse,
  type RespondentForm,
} from "@/domain/forms";
import { getPortalContext } from "./access";

export type PortalEvent = {
  id: string;
  title: string;
  description: string | null;
  /** 自分がこのフォームに申し込んだ件数 */
  myResponseCount: number;
};

/** 受付中の行事（公開範囲が members か both のフォーム） */
export async function listPortalEvents(actor: Actor, conn: DbOrTx = db): Promise<PortalEvent[]> {
  const ctx = await getPortalContext(actor, conn);
  const forms = await listOpenFormsForPortal(ctx.account.templeId, conn);
  const mine = await listResponsesOfPerson(ctx.person.id, conn);
  return forms.map((f) => ({
    id: f.id,
    title: f.title,
    description: f.description,
    myResponseCount: mine.filter((r) => r.formId === f.id).length,
  }));
}

/** 申し込みの画面に出すフォーム（台帳でわかる設問は出さない。person_list に家族の候補がつく） */
export async function getPortalEventForm(actor: Actor, formId: string, conn: DbOrTx = db): Promise<RespondentForm> {
  const ctx = await getPortalContext(actor, conn);
  const form = await getFormForRespondent(formId, { source: "portal", householdId: ctx.household.id, personId: ctx.person.id }, conn);
  if (!form || form.templeId !== ctx.account.templeId) throw notFound("行事が見つかりません");
  return form;
}

/** 行事に申し込む（source = "portal"） */
export async function submitPortalEvent(
  actor: Actor,
  formId: string,
  answers: Answers,
  conn: DbOrTx = db,
): Promise<{ id: string }> {
  const ctx = await getPortalContext(actor, conn);
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw invalid("申し込みの内容が読み取れませんでした");
  return submitResponse(actor, formId, { source: "portal", personId: ctx.person.id, householdId: ctx.household.id, answers }, conn);
}

export type PortalEventResponses = {
  /** 自分の申し込み */
  mine: MyResponse[];
  /** 世帯の申し込み（窓口だけ。家族は null） */
  household: MyResponse[] | null;
};

export async function listPortalEventResponses(actor: Actor, conn: DbOrTx = db): Promise<PortalEventResponses> {
  const ctx = await getPortalContext(actor, conn);
  const mine = await listResponsesOfPerson(ctx.person.id, conn);
  const household = ctx.can.viewHouseholdResponses ? await listResponsesOfHousehold(ctx.household.id, conn) : null;
  return { mine, household };
}

/** 施設の空き状況で一度に見られる日数 */
export const PORTAL_AVAILABILITY_DAYS = 28;
/** 何日先まで見られるか（03 の公開ページと同じ 180 日） */
export const PORTAL_AVAILABILITY_HORIZON = 180;

/** 施設の空き状況（◯×だけ。予約の内容は見えない） */
export async function getPortalAvailability(
  actor: Actor,
  opts: { start?: string; today?: string } = {},
  conn: DbOrTx = db,
): Promise<Availability> {
  const ctx = await getPortalContext(actor, conn);
  const today = opts.today ?? todayJst();
  const last = addDays(today, PORTAL_AVAILABILITY_HORIZON);
  let start = today;
  if (opts.start) {
    try {
      parseDateString(opts.start);
      start = opts.start;
    } catch {
      start = today;
    }
  }
  if (start < today) start = today;
  if (start > last) start = last;
  const end = addDays(start, PORTAL_AVAILABILITY_DAYS - 1) > last ? last : addDays(start, PORTAL_AVAILABILITY_DAYS - 1);
  return getAvailability({ from: start, to: end, templeId: ctx.account.templeId }, conn);
}
