"use server";

// 施設予約の管理画面の Server Actions。業務のロジックはドメイン層（@/domain/facility）にある
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { isDomainError, jst } from "@/domain/core";
import {
  approveReservation,
  cancelReservation,
  isReservationKind,
  registerReservation,
  rejectReservation,
} from "@/domain/facility";
import { getStaffActor } from "@/lib/staff-auth";

export type ActionState = { error?: string; message?: string; values?: Record<string, string> };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function toError(e: unknown): ActionState {
  if (isDomainError(e)) return { error: e.message };
  if (e instanceof Error && /^(日付|日時|時刻|存在しない日付)/.test(e.message)) return { error: e.message };
  throw e;
}

export async function approveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getStaffActor();
  const id = str(fd, "id");
  try {
    await approveReservation(actor, db, id);
  } catch (e) {
    return toError(e);
  }
  revalidatePath("/admin/facility", "layout");
  return { message: "承認しました。予約は確定になりました" };
}

export async function rejectAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getStaffActor();
  try {
    await rejectReservation(actor, db, str(fd, "id"), str(fd, "reason"));
  } catch (e) {
    return toError(e);
  }
  revalidatePath("/admin/facility", "layout");
  return { message: "お断りしました。申請者は申請番号の画面で理由を見られます" };
}

export async function cancelAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getStaffActor();
  try {
    await cancelReservation(actor, db, str(fd, "id"));
  } catch (e) {
    return toError(e);
  }
  revalidatePath("/admin/facility", "layout");
  return { message: "取り消しました" };
}

const CREATE_FIELDS = [
  "facilityId",
  "kind",
  "status",
  "date",
  "startTime",
  "endTime",
  "title",
  "notes",
  "contactName",
  "contactPhone",
  "contactEmail",
] as const;

export async function createAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getStaffActor();
  const values = Object.fromEntries(CREATE_FIELDS.map((k) => [k, str(fd, k)]));
  const kind = str(fd, "kind");
  const status = str(fd, "status");
  const date = str(fd, "date");
  const startTime = str(fd, "startTime");
  const endTime = str(fd, "endTime");
  if (!isReservationKind(kind) || kind === "memorial") return { error: "種類を選んでください", values };
  if (status !== "pending" && status !== "confirmed") return { error: "状態を選んでください", values };
  if (!date || !startTime || !endTime) return { error: "日付と時刻を入力してください", values };

  let id: string;
  try {
    const r = await registerReservation(actor, {
      facilityId: str(fd, "facilityId"),
      kind,
      status,
      start: jst(date, startTime),
      end: jst(date, endTime),
      title: str(fd, "title"),
      notes: str(fd, "notes"),
      contact: { name: str(fd, "contactName"), phone: str(fd, "contactPhone"), email: str(fd, "contactEmail") },
    });
    id = r.id;
  } catch (e) {
    return { ...toError(e), values };
  }
  revalidatePath("/admin/facility", "layout");
  redirect(`/admin/facility/${id}`);
}
