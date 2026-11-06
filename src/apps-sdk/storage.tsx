"use client";

// 文書の読み書き（useAppStorage）と、お寺との共有（useAppSharing）。アプリの画面（App.tsx）から使う。spec.md §7
// 本体のページが AppStorageProvider で囲み、最初の文書と共有の状態を渡す。保存と共有の変更は /apps/api/<app-id>/ を通る
// （サーバーで、cookie の利用者とアプリの ID を確かめ、暗号化して保存する。共有の変更は履歴と監査ログに残る）。
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AppAIProvider, type AppAITransport } from "./ai-client";
import { AppAssetsProvider } from "./assets";
import type { AppDocument, AppManifest, AppSharing, AppStorage } from "./types";

type StorageState = {
  docs: AppDocument[];
  pending: boolean;
  error: string | null;
  create: (data: unknown) => Promise<AppDocument | null>;
  update: (id: string, data: unknown) => Promise<AppDocument | null>;
  remove: (id: string) => Promise<boolean>;
  removeAll: () => Promise<boolean>;
  clearError: () => void;
  sharing: SharingState;
};

type SharingState = {
  available: boolean;
  shared: boolean;
  pending: boolean;
  error: string | null;
  setShared: (shared: boolean) => Promise<boolean>;
};

const StorageContext = createContext<StorageState | null>(null);

type ApiResult = { doc?: AppDocument; shared?: boolean; error?: string };

async function callApi(url: string, method: string, body?: unknown): Promise<{ ok: true; json: ApiResult } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as ApiResult;
    if (!res.ok) return { ok: false, error: json.error ?? "うまく保存できませんでした。時間をおいて、もう一度お試しください。" };
    return { ok: true, json };
  } catch {
    return { ok: false, error: "通信できませんでした。電波のよいところで、もう一度お試しください。" };
  }
}

/** 本体の AI の送り先。本体の AI の中継（同意、上限、記録）はまだ作っていないので、準備中として返す（docs/tasks/08-apps.md） */
const HOST_AI_TRANSPORT: AppAITransport = {
  ready: false,
  unavailableMessage: "AI は準備中です。しばらくお待ちください",
  getConsent: async () => false,
  setConsent: async () => false,
  run: async () => ({ ok: false, kind: "unavailable", message: "AI は準備中です。しばらくお待ちください" }),
};

export function AppStorageProvider({
  appId,
  manifest,
  initialDocs,
  sharing,
  children,
}: {
  appId: string;
  manifest: AppManifest;
  initialDocs: AppDocument[];
  /** available: アプリがお寺との共有に対応しているか（manifest の sharing）。shared: 今の状態 */
  sharing: { available: boolean; shared: boolean };
  children: ReactNode;
}) {
  const [docs, setDocs] = useState<AppDocument[]>(initialDocs);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shared, setSharedState] = useState(sharing.shared);
  const [sharingPending, setSharingPending] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);
  const base = `/apps/api/${encodeURIComponent(appId)}`;

  const call = useCallback(async (url: string, method: string, body?: unknown): Promise<ApiResult | null> => {
    setPending(true);
    setError(null);
    const r = await callApi(url, method, body);
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    return r.json;
  }, []);

  const create = useCallback(
    async (data: unknown) => {
      const r = await call(`${base}/docs`, "POST", { data });
      if (!r?.doc) return null;
      const doc = r.doc;
      setDocs((d) => [doc, ...d]);
      return doc;
    },
    [base, call],
  );

  const update = useCallback(
    async (id: string, data: unknown) => {
      const r = await call(`${base}/docs/${encodeURIComponent(id)}`, "PUT", { data });
      if (!r?.doc) return null;
      const doc = r.doc;
      setDocs((d) => d.map((x) => (x.id === id ? doc : x)));
      return doc;
    },
    [base, call],
  );

  const remove = useCallback(
    async (id: string) => {
      const r = await call(`${base}/docs/${encodeURIComponent(id)}`, "DELETE");
      if (!r) return false;
      setDocs((d) => d.filter((x) => x.id !== id));
      return true;
    },
    [base, call],
  );

  const removeAll = useCallback(async () => {
    const r = await call(`${base}/docs`, "DELETE");
    if (!r) return false;
    setDocs([]);
    return true;
  }, [base, call]);

  const setShared = useCallback(
    async (next: boolean) => {
      if (!sharing.available) {
        setSharingError("このアプリは、お寺との共有に対応していません");
        return false;
      }
      setSharingPending(true);
      setSharingError(null);
      const r = await callApi(`${base}/sharing`, "PUT", { shared: next });
      setSharingPending(false);
      if (!r.ok) {
        setSharingError(r.error);
        return false;
      }
      setSharedState(r.json.shared ?? next);
      return true;
    },
    [base, sharing.available],
  );

  const value = useMemo<StorageState>(
    () => ({
      docs,
      pending,
      error,
      create,
      update,
      remove,
      removeAll,
      clearError: () => setError(null),
      sharing: { available: sharing.available, shared, pending: sharingPending, error: sharingError, setShared },
    }),
    [docs, pending, error, create, update, remove, removeAll, sharing.available, shared, sharingPending, sharingError, setShared],
  );
  return (
    <StorageContext.Provider value={value}>
      <AppAssetsProvider baseUrl={`/app-assets/${encodeURIComponent(appId)}`}>
        <AppAIProvider manifest={manifest} transport={HOST_AI_TRANSPORT} initialConsent={false}>
          {children}
        </AppAIProvider>
      </AppAssetsProvider>
    </StorageContext.Provider>
  );
}

function useStorageContext(name: string): StorageState {
  const s = useContext(StorageContext);
  if (!s) throw new Error(`${name} は、お寺のアプリの画面（App.tsx）の中で使ってください`);
  return s;
}

/** 利用者の文書を読み書きする。T は文書の data の型（アプリが決める） */
export function useAppStorage<T = unknown>(): AppStorage<T> {
  return useStorageContext("useAppStorage") as unknown as AppStorage<T>;
}

/** お寺との共有（文言、デザイン、置き場所はアプリが自由に決める。変更は履歴と監査ログに残り、基盤の帯の表示も変わる） */
export function useAppSharing(): AppSharing {
  const { sharing } = useStorageContext("useAppSharing");
  return {
    available: sharing.available,
    shared: sharing.shared,
    pending: sharing.pending,
    error: sharing.error,
    share: () => sharing.setShared(true),
    unshare: () => sharing.setShared(false),
  };
}
