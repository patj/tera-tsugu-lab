// ご家族の権限の保存（POST。窓口だけ。判定はドメイン層）
import type { NextRequest } from "next/server";
import { setFamilyPermissions } from "@/domain/portal";
import { portalPost, str } from "../../../_lib/post";

export async function POST(req: NextRequest) {
  return portalPost(req, "/portal/family", async ({ actor, form }) => {
    await setFamilyPermissions(actor, {
      portalAccountId: str(form, "accountId"),
      canViewHousehold: str(form, "canViewHousehold") === "1",
      canApplyMemorial: str(form, "canApplyMemorial") === "1",
    });
    return "/portal/family?done=1";
  });
}
