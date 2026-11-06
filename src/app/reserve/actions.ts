"use server";

// 公開ページの申請（ログインなし）。業務のロジックはドメイン層（submitPublicApplication）にある
import { redirect } from "next/navigation";
import { isDomainError } from "@/domain/core";
import { submitPublicApplication, type ApplyPeriod } from "@/domain/facility";

export type ApplyState = { error?: string; values?: Record<string, string> };

const FIELDS = ["facilityId", "kind", "date", "period", "startTime", "endTime", "name", "phone", "email", "notes"] as const;

export async function applyAction(_prev: ApplyState, fd: FormData): Promise<ApplyState> {
  const v = Object.fromEntries(FIELDS.map((k) => [k, String(fd.get(k) ?? "").trim()])) as Record<
    (typeof FIELDS)[number],
    string
  >;
  let code: string;
  try {
    const r = await submitPublicApplication({
      facilityId: v.facilityId,
      kind: v.kind,
      date: v.date,
      period: (v.period || "am") as ApplyPeriod | "custom",
      startTime: v.startTime,
      endTime: v.endTime,
      name: v.name,
      phone: v.phone,
      email: v.email,
      notes: v.notes,
    });
    code = r.requestCode;
  } catch (e) {
    if (isDomainError(e)) return { error: e.message, values: v };
    throw e;
  }
  redirect(`/reserve/status?${new URLSearchParams({ code, new: "1" }).toString()}`);
}
