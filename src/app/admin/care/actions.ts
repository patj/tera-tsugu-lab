"use server";

// こころのケアの管理画面の Server Actions。ロジックはドメイン層（@/domain/care）にある
import { redirect } from "next/navigation";
import { isDomainError } from "@/domain/core";
import { markCareAlertSeen } from "@/domain/care";
import { getStaffActor } from "@/lib/staff-auth";

/** アラートを確認済みにする */
export async function markCareAlertSeenAction(fd: FormData): Promise<void> {
  const actor = await getStaffActor();
  const back = String(fd.get("back") ?? "/admin/care");
  const safeBack = back.startsWith("/admin/care") ? back : "/admin/care";
  try {
    await markCareAlertSeen(actor, String(fd.get("alertId") ?? ""));
  } catch (e) {
    if (isDomainError(e)) redirect(`${safeBack}${safeBack.includes("?") ? "&" : "?"}error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(safeBack);
}
