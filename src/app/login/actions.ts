"use server";

import { redirect } from "next/navigation";
import { authenticateStaff, staffActor, writeAuditLog } from "@/domain/core";
import { endStaffSession, startStaffSession } from "@/lib/staff-auth";

export type LoginState = { error?: string };

function safeNext(next: FormDataEntryValue | null): string {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/admin") ? s : "/admin";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const staff = await authenticateStaff(email, password);
  if (!staff) return { error: "メールアドレスかパスワードが違います" };
  await startStaffSession(staff.id);
  await writeAuditLog(staffActor(staff, "web"), { action: "login", result: "ok" });
  redirect(safeNext(formData.get("next")));
}

export async function logout(): Promise<void> {
  await endStaffSession();
  redirect("/login");
}
