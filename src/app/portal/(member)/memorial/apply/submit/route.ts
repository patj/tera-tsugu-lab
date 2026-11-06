// 法要の申し込み（POST）。世帯は操作者の本人から決める（フォームの値は故人・施主・希望だけ）
import type { NextRequest } from "next/server";
import { invalid } from "@/domain/core";
import { applyMemorial } from "@/domain/portal";
import { portalPost, str } from "../../../../_lib/post";

export async function POST(req: NextRequest) {
  return portalPost(req, "/portal/memorial/apply", async ({ actor, form }) => {
    const targets = form
      .getAll("target")
      .filter((v): v is string => typeof v === "string" && v !== "")
      .map((personId) => ({ personId, kaiki: Number(str(form, `kaiki_${personId}`)) }));
    const seshu = str(form, "seshu");
    const otoki = str(form, "otoki");
    if (seshu === "__name__" && !str(form, "seshuName")) throw invalid("施主のお名前を入力してください");
    await applyMemorial(actor, {
      targets,
      seshuPersonId: seshu && seshu !== "__name__" ? seshu : null,
      seshuName: seshu === "__name__" ? str(form, "seshuName") : null,
      preferredPeriods: [1, 2, 3].map((i) => ({
        from: str(form, `p${i}_from`),
        to: str(form, `p${i}_to`),
        note: str(form, `p${i}_note`),
      })),
      location: str(form, "location"),
      attendees: str(form, "attendees") ? Number(str(form, "attendees")) : null,
      otoki: otoki === "yes" ? true : otoki === "no" ? false : null,
      notes: str(form, "notes"),
    });
    return "/portal/memorial/requests?done=1";
  });
}
