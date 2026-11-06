// お寺のアプリの一覧（npm run apps:gen が生成した registry を使う）
import { APP_DEFINITIONS } from "@/apps-sdk/registry.generated";
import type { AppDefinition, AppManifest } from "@/apps-sdk/types";
import { invalid, notFound } from "../core/errors";

let apps: AppDefinition[] = APP_DEFINITIONS;

/** テスト用: アプリの一覧を差し替える（null で元に戻す） */
export function setAppsForTesting(defs: AppDefinition[] | null): void {
  apps = defs ?? APP_DEFINITIONS;
}

export function listApps(): AppManifest[] {
  return apps.map((a) => a.manifest);
}

export function findApp(appId: string): AppManifest | undefined {
  return apps.find((a) => a.manifest.id === appId)?.manifest;
}

export function getApp(appId: string): AppManifest {
  const m = findApp(appId);
  if (!m) throw notFound("アプリが見つかりません");
  return m;
}

/** お寺との共有を使うアプリ */
export function getSharingApp(appId: string): AppManifest {
  const m = getApp(appId);
  if (!m.sharing) throw invalid("このアプリは、お寺との共有に対応していません");
  return m;
}
