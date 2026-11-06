"use server";

// 法要の受付の管理画面の Server Actions。業務のロジックはドメイン層（@/domain/memorial）にある
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isDomainError, jst } from "@/domain/core";
import { bookMemorialService, cancelMemorialService, declineMemorialRequest, isMemorialLocation } from "@/domain/memorial";
import { getStaffActor } from "@/lib/staff-auth";

export type ActionState = { error?: string; message?: string };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const optInt = (fd: FormData, key: string): number | null => {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function toError(e: unknown): ActionState {
  if (isDomainError(e)) return { error: e.message };
  if (e instanceof Error && /^(日付|日時|時刻|存在しない日付)/.test(e.message)) return { error: e.message };
  throw e;
}

/**
 * 法要を確定する。
 * 送る値: slot（"YYYY-MM-DD|HH:MM|担当者の ID"）、target（"person_id:回忌"。複数）、memorialRequestId か householdId、
 * location、travelBefore、travelAfter、locationAddress（自宅・墓前）、seshuPersonId / seshuName、notes
 */
export async function bookAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getStaffActor();
  const slot = str(fd, "slot");
  const [date, time, officiantStaffId] = slot.split("|");
  if (!date || !time || !officiantStaffId) return { error: "候補の日時と担当者を選んでください" };
  const location = str(fd, "location");
  const targets = fd
    .getAll("target")
    .map(String)
    .filter(Boolean)
    .map((s) => {
      const [personId, kaiki] = s.split(":");
      return { personId, kaiki: Number(kaiki) };
    });
  let serviceId: string;
  try {
    const r = await bookMemorialService(actor, {
      memorialRequestId: str(fd, "memorialRequestId") || null,
      householdId: str(fd, "householdId") || null,
      targets: targets.length > 0 ? targets : null,
      location: isMemorialLocation(location) ? location : null,
      start: jst(date, time),
      officiantStaffId,
      travelBeforeMin: optInt(fd, "travelBefore"),
      travelAfterMin: optInt(fd, "travelAfter"),
      locationAddress: str(fd, "locationAddress") || null,
      seshuPersonId: str(fd, "seshuPersonId") || null,
      seshuName: str(fd, "seshuName") || null,
      notes: str(fd, "notes") || null,
    });
    serviceId = r.serviceId;
  } catch (e) {
    return toError(e);
  }
  revalidatePath("/admin/memorial", "layout");
  redirect(`/admin/memorial/services/${serviceId}?booked=1`);
}

export async function declineAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getStaffActor();
  try {
    await declineMemorialRequest(actor, str(fd, "id"), str(fd, "reason"));
  } catch (e) {
    return toError(e);
  }
  revalidatePath("/admin/memorial", "layout");
  return { message: "お断りしました。ポータルに「お断り」と理由が表示されます" };
}

export async function cancelAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getStaffActor();
  try {
    const r = await cancelMemorialService(actor, str(fd, "id"));
    revalidatePath("/admin/memorial", "layout");
    return {
      message:
        `法要を取り消しました（担当者の予定 ${r.cancelledEvents} 件、本堂の予約 ${r.cancelledReservations} 件も取り消しました）。` +
        (r.reopenedRequests > 0 ? "申し込みは「受付済み」に戻しました" : ""),
    };
  } catch (e) {
    return toError(e);
  }
}
