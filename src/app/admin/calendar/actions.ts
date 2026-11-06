"use server";
// カレンダーの Server Actions。入力を受け取ってドメイン層を呼ぶだけ（権限と私的な予定の保護はドメイン層が行う）
import { redirect } from "next/navigation";
import { cancelEvent, createEvent, getEvent, updateEvent, type EventVisibility } from "@/domain/calendar";
import { isDomainError, jst, jstDateString } from "@/domain/core";
import { getStaffActor } from "@/lib/staff-auth";

export type SubmittedValues = {
  title: string;
  body: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  assigneeStaffIds: string[];
};
/** エラーのときは、入力した値を返す（React はフォームの送信のあとで入力を初期値に戻すため） */
export type EventFormState = { error?: string; values?: SubmittedValues };

function str(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function userMessage(e: unknown): string | null {
  if (isDomainError(e)) return e.message;
  if (e instanceof Error && /^(日付|日時|時刻|存在しない日付)/.test(e.message)) return e.message;
  return null;
}

function parseWhen(formData: FormData) {
  const startDate = str(formData, "startDate");
  const endDate = str(formData, "endDate") || startDate;
  const start = jst(startDate, str(formData, "startTime"));
  const end = jst(endDate, str(formData, "endTime"));
  return { start, end };
}

export async function saveEvent(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const actor = await getStaffActor();
  const eventId = str(formData, "eventId");
  const assigneeStaffIds = formData.getAll("assignees").filter((v): v is string => typeof v === "string");
  const values: SubmittedValues = {
    title: str(formData, "title"),
    body: str(formData, "body"),
    startDate: str(formData, "startDate"),
    startTime: str(formData, "startTime"),
    endDate: str(formData, "endDate"),
    endTime: str(formData, "endTime"),
    assigneeStaffIds,
  };
  let start: Date;
  try {
    const when = parseWhen(formData);
    start = when.start;
    const common = {
      category: str(formData, "category"),
      title: str(formData, "title"),
      body: str(formData, "body"),
      start: when.start,
      end: when.end,
      assigneeStaffIds,
    };
    if (eventId) {
      await updateEvent(actor, eventId, common);
    } else {
      await createEvent(actor, { ...common, visibility: str(formData, "visibility") as EventVisibility });
    }
  } catch (e) {
    const msg = userMessage(e);
    if (msg) return { error: msg, values };
    throw e;
  }
  redirect(`/admin/calendar?date=${jstDateString(start)}`);
}

export async function cancelEventAction(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const actor = await getStaffActor();
  const eventId = str(formData, "eventId");
  let date: string;
  try {
    const event = await getEvent(actor, eventId);
    date = jstDateString(event.start);
    await cancelEvent(actor, eventId);
  } catch (e) {
    const msg = userMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
  redirect(`/admin/calendar?date=${date}`);
}
