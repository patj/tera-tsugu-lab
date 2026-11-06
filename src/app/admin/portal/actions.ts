"use server";

// ポータルの管理画面の Server Actions。業務のロジックはドメイン層（@/domain/portal）にある
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isDomainError } from "@/domain/core";
import { issueInvite, setFamilyPermissionsByStaff } from "@/domain/portal";
import { getStaffActor } from "@/lib/staff-auth";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function withParams(path: string, params: Record<string, string>): string {
  const [base, query] = path.split("?");
  const sp = new URLSearchParams(query);
  for (const [k, v] of Object.entries(params)) sp.set(k, v);
  return `${base}?${sp.toString()}`;
}

/** 招待コードを発行する（個人ごと） */
export async function issueInviteAction(fd: FormData): Promise<void> {
  const actor = await getStaffActor();
  const householdId = str(fd, "householdId");
  const back = `/admin/portal/invites?household=${encodeURIComponent(householdId)}`;
  let issuedId: string;
  try {
    issuedId = (await issueInvite(actor, { personId: str(fd, "personId") })).id;
  } catch (e) {
    if (isDomainError(e)) redirect(withParams(back, { error: e.message }));
    throw e;
  }
  revalidatePath("/admin/portal", "layout");
  redirect(withParams(back, { issued: issuedId }));
}

/** 家族の権限の代行設定（窓口の意向の確認が必須。監査ログと対応記録に残る） */
export async function setPermissionsByStaffAction(fd: FormData): Promise<void> {
  const actor = await getStaffActor();
  const accountId = str(fd, "accountId");
  const back = `/admin/portal/accounts/${encodeURIComponent(accountId)}`;
  try {
    await setFamilyPermissionsByStaff(actor, {
      portalAccountId: accountId,
      canViewHousehold: str(fd, "canViewHousehold") === "1",
      canApplyMemorial: str(fd, "canApplyMemorial") === "1",
      confirmation: str(fd, "confirmation"),
    });
  } catch (e) {
    if (isDomainError(e)) redirect(withParams(back, { error: e.message }));
    throw e;
  }
  revalidatePath("/admin/portal", "layout");
  redirect(withParams(back, { saved: "1" }));
}
