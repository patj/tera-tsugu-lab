"use client";

// 文書の読み書き（useAppStorage）と、お寺との共有（useAppSharing）。アプリの画面（App.tsx）から使う。spec.md §7
// 本体のページが AppStorageProvider で囲み、最初の文書と共有の状態を渡す。保存と共有の変更は /apps/api/<app-id>/ を通る
// （サーバーで、cookie の利用者とアプリの ID を確かめ、暗号化して保存する。共有の変更は履歴と監査ログに残る）。
// 共有は 2 段: アプリ単位（useAppSharing）と、sharing: "perDoc" のアプリの 1 件ずつの印（useAppStorage の create の shared、setShared）
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AppAIProvider, type AppAITransport } from "./ai-client";
import { AppAssetsProvider } from "./assets";
import { appSharesPerDoc, type AppAIResult, type AppCreateOptions, type AppDocument, type AppManifest, type AppSharing, type AppStorage } from "./types";

type StorageState = {
  docs: AppDocument[];
  pending: boolean;
  error: string | null;
  create: (data: unknown, options?: AppCreateOptions) => Promise<AppDocument | null>;
  update: (id: string, data: unknown) => Promise<AppDocument | null>;
  remove: (id: string) => Promise<boolean>;
  removeAll: () => Promise<boolean>;
  /** 1 件ずつの共有の印（文書ごと） */
  setShared: (id: string, shared: boolean) => Promise<boolean>;
  clearError: () => void;
  /** アプリ単位の共有（useAppSharing が使う） */
  sharing: SharingState;
};

type SharingState = {
  available: boolean;
  perDoc: boolean;
  shared: boolean;
  pending: boolean;
  error: string | null;
  setAppShared: (shared: boolean) => Promise<boolean>;
};

const PER_DOC_UNSUPPORTED = "このアプリは、1 件ずつの共有に対応していません";

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

/** 本体の AI の送り先（/apps/api/<app-id>/ai/<仕事> と ai-consent。同意、上限、記録はサーバーが行う） */
function hostAiTransport(appId: string): AppAITransport {
  const base = `/apps/api/${encodeURIComponent(appId)}`;
  const failed = (message?: string): AppAIResult<unknown> => ({
    ok: false,
    kind: "unavailable",
    message: message ?? "AI につながりませんでした。時間をおいて、もう一度お試しください。",
  });
  return {
    ready: true,
    getConsent: async () => {
      const r = await callApi(`${base}/ai-consent`, "GET");
      return r.ok && (r.json as { consented?: boolean }).consented === true;
    },
    setConsent: async (version, agreed) => {
      const r = await callApi(`${base}/ai-consent`, "PUT", { version, agreed });
      return r.ok && (r.json as { consented?: boolean }).consented === true;
    },
    run: async (task, payload) => {
      try {
        const res = await fetch(`${base}/ai/${encodeURIComponent(task)}`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => null)) as { ok?: unknown; error?: string } | null;
        if (json && typeof json.ok === "boolean") return json as AppAIResult<unknown>;
        return failed(json?.error);
      } catch {
        return failed();
      }
    },
  };
}

export function AppStorageProvider({
  appId,
  manifest,
  initialDocs,
  initialAiConsent = false,
  sharing,
  children,
}: {
  appId: string;
  manifest: AppManifest;
  initialDocs: AppDocument[];
  /** 今の説明に、AI に送ることを同意しているか（サーバーで読んで渡す） */
  initialAiConsent?: boolean;
  /** available: アプリがお寺との共有に対応しているか（manifest の sharing）。shared: 今の状態 */
  sharing: { available: boolean; shared: boolean };
  children: ReactNode;
}) {
  const perDoc = appSharesPerDoc(manifest);
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
    async (data: unknown, options?: AppCreateOptions) => {
      if (options?.shared === true && !perDoc) {
        setError(PER_DOC_UNSUPPORTED);
        return null;
      }
      const r = await call(`${base}/docs`, "POST", options?.shared === undefined ? { data } : { data, shared: options.shared });
      if (!r?.doc) return null;
      const doc = r.doc;
      setDocs((d) => [doc, ...d]);
      return doc;
    },
    [base, call, perDoc],
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

  const setDocShared = useCallback(
    async (id: string, next: boolean) => {
      if (!perDoc) {
        setError(PER_DOC_UNSUPPORTED);
        return false;
      }
      const r = await call(`${base}/docs/${encodeURIComponent(id)}/sharing`, "PUT", { shared: next });
      if (!r?.doc) return false;
      const doc = r.doc;
      setDocs((d) => d.map((x) => (x.id === id ? doc : x)));
      return true;
    },
    [base, call, perDoc],
  );

  const aiTransport = useMemo(() => hostAiTransport(appId), [appId]);

  const removeAll = useCallback(async () => {
    const r = await call(`${base}/docs`, "DELETE");
    if (!r) return false;
    setDocs([]);
    return true;
  }, [base, call]);

  const setAppShared = useCallback(
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
      setShared: setDocShared,
      clearError: () => setError(null),
      sharing: { available: sharing.available, perDoc, shared, pending: sharingPending, error: sharingError, setAppShared },
    }),
    [docs, pending, error, create, update, remove, removeAll, setDocShared, sharing.available, perDoc, shared, sharingPending, sharingError, setAppShared],
  );
  return (
    <StorageContext.Provider value={value}>
      <AppAssetsProvider baseUrl={`/app-assets/${encodeURIComponent(appId)}`}>
        <AppAIProvider manifest={manifest} transport={aiTransport} initialConsent={initialAiConsent}>
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
    perDoc: sharing.perDoc,
    shared: sharing.shared,
    pending: sharing.pending,
    error: sharing.error,
    share: () => sharing.setAppShared(true),
    unshare: () => sharing.setAppShared(false),
  };
}
