"use server";

// お寺のアプリの利用者の画面の Server Actions（はじめる、共有の設定）。ロジックはドメイン層（@/domain/apps）にある
import { redirect } from "next/navigation";
import { getDefaultTempleId, isDomainError } from "@/domain/core";
import { safeAppsReturnPath, setAppSharing, startAppUser } from "@/domain/apps";
import { requireAppSession, startAppSession } from "@/lib/apps-auth";

function back(path: string, error: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}`);
}

/** ニックネームで始める（ID はランダムに作り、この端末の cookie にだけ保存する） */
export async function startAppsAction(fd: FormData): Promise<void> {
  // ホーム画面のアプリなどから来たときは、はじめたあとに元のアプリへ戻る（/apps/<app-id> の形だけ）
  const next = safeAppsReturnPath(fd.get("next"));
  const startPath = next ? `/apps?next=${encodeURIComponent(next)}` : "/apps";
  if (fd.get("understood") !== "1") back(startPath, "はじめる前の説明を読んで、チェックを入れてください");
  try {
    const user = await startAppUser(await getDefaultTempleId(), String(fd.get("nickname") ?? ""));
    await startAppSession(user.id);
  } catch (e) {
    if (isDomainError(e)) back(startPath, e.message);
    console.error(`apps: 開始に失敗しました（${e instanceof Error ? e.name : typeof e}）`);
    back(startPath, "うまく始められませんでした。時間をおいて、もう一度お試しください。");
  }
  redirect(next ?? "/apps");
}

/** お寺との共有を変える */
export async function setAppSharingAction(appId: string, fd: FormData): Promise<void> {
  const { actor } = await requireAppSession();
  const path = `/apps/${encodeURIComponent(appId)}/sharing`;
  const shared = fd.get("shared") === "1";
  try {
    await setAppSharing(actor, appId, shared);
  } catch (e) {
    if (isDomainError(e)) back(path, e.message);
    console.error(`apps: 共有の変更に失敗しました（${e instanceof Error ? e.name : typeof e}）`);
    back(path, "うまく変更できませんでした。時間をおいて、もう一度お試しください。");
  }
  redirect(`${path}?done=${shared ? "shared" : "stopped"}`);
}
