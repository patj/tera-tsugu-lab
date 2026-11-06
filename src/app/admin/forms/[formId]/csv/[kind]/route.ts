// 回答（responses）と名簿（roster）の CSV。proxy は cookie があるかしか見ないので、ここでログインを確かめる
import { NextResponse, type NextRequest } from "next/server";
import { isDomainError, staffActor } from "@/domain/core";
import { responsesCsv, rosterCsv } from "@/domain/forms";
import { findCurrentStaff } from "@/lib/staff-auth";

export async function GET(_req: NextRequest, ctx: RouteContext<"/admin/forms/[formId]/csv/[kind]">) {
  const { formId, kind } = await ctx.params;
  const staff = await findCurrentStaff();
  if (!staff) return new NextResponse("ログインしてください", { status: 401 });
  if (kind !== "responses" && kind !== "roster") return new NextResponse("見つかりません", { status: 404 });
  try {
    const actor = staffActor(staff, "web");
    const file = kind === "roster" ? await rosterCsv(actor, formId) : await responsesCsv(actor, formId);
    return new NextResponse(file.body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        // 日本語のファイル名は filename* で渡す（filename に直接入れるとヘッダーが不正になる）
        "Content-Disposition": `attachment; filename="${kind}.csv"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new NextResponse(e.message, { status: e.code === "not_found" ? 404 : 400 });
    throw e;
  }
}
