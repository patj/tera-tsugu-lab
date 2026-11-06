"use server";

import { redirect } from "next/navigation";
import { isDomainError } from "@/domain/core";
import { findFormRow, publicRespondentActor, resolveHouseholdToken, submitResponse, type Answers } from "@/domain/forms";

export type SubmitState = { error?: string };

/** 公開フォームの送信。個別リンクのトークンは、ここで世帯に引き直す（ブラウザから来た世帯の ID は信じない） */
export async function submitPublicForm(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const formId = String(formData.get("formId") ?? "");
  const token = String(formData.get("t") ?? "");
  let answers: Answers;
  try {
    const parsed: unknown = JSON.parse(String(formData.get("answers") ?? "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    answers = parsed as Answers;
  } catch {
    return { error: "送信の内容が読み取れませんでした。ページを読み込み直してください。" };
  }

  try {
    const form = await findFormRow(formId);
    if (!form) return { error: "フォームが見つかりません。" };
    let householdId: string | null = null;
    if (token && form.mode !== "public") {
      householdId = await resolveHouseholdToken(form.id, token);
      if (!householdId) return { error: "このリンクは使えません。お寺にお問い合わせください。" };
    }
    await submitResponse(publicRespondentActor(form.templeId), form.id, {
      source: householdId ? "member_link" : "public",
      householdId,
      answers,
    });
  } catch (e) {
    if (isDomainError(e)) return { error: e.message };
    console.error(e);
    return { error: "送信できませんでした。時間をおいて、もう一度お試しください。" };
  }
  redirect(`/f/${formId}/thanks`);
}
