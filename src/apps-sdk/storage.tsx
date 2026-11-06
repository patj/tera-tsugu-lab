"use client";

// 文書の読み書き（useAppStorage）。アプリの画面（App.tsx）から使う。spec.md §7
// 本体のページが AppStorageProvider で囲み、最初の文書を渡す。保存は /apps/api/<app-id>/docs を通る
// （サーバーで、cookie の利用者とアプリの ID を確かめ、暗号化して保存する）。
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AppDocument } from "./types";

type StorageState = {
  docs: AppDocument[];
  pending: boolean;
  error: string | null;
  create: (data: unknown) => Promise<AppDocument | null>;
  update: (id: string, data: unknown) => Promise<AppDocument | null>;
  remove: (id: string) => Promise<boolean>;
  clearError: () => void;
};

const StorageContext = createContext<StorageState | null>(null);

type ApiResult = { doc?: AppDocument; error?: string };

export function AppStorageProvider({
  appId,
  initialDocs,
  children,
}: {
  appId: string;
  initialDocs: AppDocument[];
  children: ReactNode;
}) {
  const [docs, setDocs] = useState<AppDocument[]>(initialDocs);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/apps/api/${encodeURIComponent(appId)}/docs`;

  const call = useCallback(async (url: string, method: string, body?: unknown): Promise<ApiResult | null> => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as ApiResult;
      if (!res.ok) {
        setError(json.error ?? "うまく保存できませんでした。時間をおいて、もう一度お試しください。");
        return null;
      }
      return json;
    } catch {
      setError("通信できませんでした。電波のよいところで、もう一度お試しください。");
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  const create = useCallback(
    async (data: unknown) => {
      const r = await call(base, "POST", { data });
      if (!r?.doc) return null;
      const doc = r.doc;
      setDocs((d) => [doc, ...d]);
      return doc;
    },
    [base, call],
  );

  const update = useCallback(
    async (id: string, data: unknown) => {
      const r = await call(`${base}/${encodeURIComponent(id)}`, "PUT", { data });
      if (!r?.doc) return null;
      const doc = r.doc;
      setDocs((d) => d.map((x) => (x.id === id ? doc : x)));
      return doc;
    },
    [base, call],
  );

  const remove = useCallback(
    async (id: string) => {
      const r = await call(`${base}/${encodeURIComponent(id)}`, "DELETE");
      if (!r) return false;
      setDocs((d) => d.filter((x) => x.id !== id));
      return true;
    },
    [base, call],
  );

  const value = useMemo<StorageState>(
    () => ({ docs, pending, error, create, update, remove, clearError: () => setError(null) }),
    [docs, pending, error, create, update, remove],
  );
  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>;
}

export type AppStorage<T> = {
  /** 自分の文書（新しい順） */
  docs: AppDocument<T>[];
  /** 保存の途中か */
  pending: boolean;
  /** 直前の操作のエラー（利用者に見せてよい文） */
  error: string | null;
  /** 文書を作る。失敗したら null（error に理由が入る） */
  create: (data: T) => Promise<AppDocument<T> | null>;
  /** 文書を置き換える。失敗したら null */
  update: (id: string, data: T) => Promise<AppDocument<T> | null>;
  /** 文書を消す（元に戻せない）。失敗したら false */
  remove: (id: string) => Promise<boolean>;
  clearError: () => void;
};

/** 利用者の文書を読み書きする。T は文書の data の型（アプリが決める） */
export function useAppStorage<T = unknown>(): AppStorage<T> {
  const s = useContext(StorageContext);
  if (!s) throw new Error("useAppStorage は、お寺のアプリの画面（App.tsx）の中で使ってください");
  return s as unknown as AppStorage<T>;
}
