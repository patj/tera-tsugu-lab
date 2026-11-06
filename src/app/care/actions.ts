"use server";

// ケアのポータルの Server Actions。ロジックはドメイン層（@/domain/care）にある。
// 記録の本文を、ログや URL に出さない（エラーのときも、ドメイン層のメッセージだけを返す）
import { redirect } from "next/navigation";
import { getDefaultTempleId, isDomainError } from "@/domain/core";
import { careDataFromForm, getCareTool, saveCareEntry, setCareConsent, startCareSubject } from "@/domain/care";
import { requireCareSession, startCareSession } from "@/lib/care-auth";

function back(path: string, error: string): never {
  redirect(`${path}?error=${encodeURIComponent(error)}`);
}

/** 本文を含みうるエラーの詳細は出さず、種類だけをログに残す */
function logFailure(where: string, e: unknown): void {
  console.error(`care: ${where} に失敗しました（${e instanceof Error ? e.name : typeof e}）`);
}

/** ニックネームで始める（ID はランダムに作り、この端末の cookie にだけ保存する） */
export async function startCareAction(fd: FormData): Promise<void> {
  if (fd.get("understood") !== "1") back("/care", "はじめる前の説明を読んで、チェックを入れてください");
  try {
    const subject = await startCareSubject(await getDefaultTempleId(), String(fd.get("nickname") ?? ""));
    await startCareSession(subject.id);
  } catch (e) {
    if (isDomainError(e)) back("/care", e.message);
    logFailure("開始", e);
    back("/care", "うまく始められませんでした。時間をおいて、もう一度お試しください。");
  }
  redirect("/care");
}

/** 記録を保存する。危機を検知したら、保存のあとの画面で相談窓口を目立つように出す */
export async function saveCareEntryAction(toolId: string, fd: FormData): Promise<void> {
  const { actor } = await requireCareSession();
  const path = `/care/t/${encodeURIComponent(toolId)}`;
  let crisis = false;
  try {
    const tool = getCareTool(toolId);
    crisis = (await saveCareEntry(actor, toolId, careDataFromForm(tool.manifest, fd))).crisis;
  } catch (e) {
    if (isDomainError(e)) back(path, e.message);
    logFailure("記録の保存", e);
    back(path, "うまく保存できませんでした。時間をおいて、もう一度お試しください。");
  }
  redirect(`${path}/saved${crisis ? "?support=1" : ""}`);
}

/** お寺との共有を変える */
export async function setCareSharingAction(toolId: string, fd: FormData): Promise<void> {
  const { actor } = await requireCareSession();
  const path = `/care/t/${encodeURIComponent(toolId)}/sharing`;
  const shared = fd.get("shared") === "1";
  try {
    await setCareConsent(actor, toolId, shared);
  } catch (e) {
    if (isDomainError(e)) back(path, e.message);
    logFailure("共有の変更", e);
    back(path, "うまく変更できませんでした。時間をおいて、もう一度お試しください。");
  }
  redirect(`${path}?done=${shared ? "shared" : "stopped"}`);
}
