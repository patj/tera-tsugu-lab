"use client";

// 開発キット版の useAppStorage / useAppSharing。形は本体と同じ（型は types.ts を共有）。
// 本体はサーバーに暗号化して保存するが、キットではブラウザの localStorage に保存する（試すためだけ。アプリのコードは localStorage を使ってはいけない）。
// 本体と同じように、JSON にできない値は JSON にした形で保存し、大きさと件数の上限、エラーの文を再現する。
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { APP_DOCUMENT_MAX_BYTES, APP_DOCUMENTS_MAX_PER_APP, type AppDocument, type AppSharing, type AppStorage } from "./types";

export type PreviewData = { docs: AppDocument[]; shared: boolean };

const key = (appId: string) => `temple-app-kit:${appId}`;

export function loadPreviewData(appId: string): PreviewData {
  try {
    const raw = localStorage.getItem(key(appId));
    if (raw) return JSON.parse(raw) as PreviewData;
  } catch {
    // 壊れていたら空にする
  }
  return { docs: [], shared: false };
}

function savePreviewData(appId: string, data: PreviewData): void {
  localStorage.setItem(key(appId), JSON.stringify(data));
}

export function clearPreviewData(appId: string): void {
  localStorage.removeItem(key(appId));
}

class KitError extends Error {}

/** 本体のサーバーと同じ検証（エラーの文も同じ） */
function serialize(data: unknown): unknown {
  if (data === undefined) throw new KitError("保存する内容がありません");
  let json: string | undefined;
  try {
    json = JSON.stringify(data);
  } catch {
    throw new KitError("保存できない形の内容です");
  }
  if (json === undefined) throw new KitError("保存できない形の内容です");
  if (new TextEncoder().encode(json).length > APP_DOCUMENT_MAX_BYTES) {
    throw new KitError(`1 件の大きさは ${Math.floor(APP_DOCUMENT_MAX_BYTES / 1024)} KB までです`);
  }
  return JSON.parse(json);
}

/** 本体の通信の待ち時間に近づける */
const wait = () => new Promise((r) => setTimeout(r, 150));

type Ctx = { storage: AppStorage<unknown>; sharing: AppSharing };
const StorageContext = createContext<Ctx | null>(null);

/** 試す画面がアプリを囲む（本体の AppStorageProvider にあたる） */
export function PreviewStorageProvider({
  appId,
  sharingAvailable,
  children,
}: {
  appId: string;
  sharingAvailable: boolean;
  children: ReactNode;
}) {
  const [data, setData] = useState<PreviewData>(() => loadPreviewData(appId));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharingPending, setSharingPending] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);

  const run = useCallback(
    async <R,>(fn: (cur: PreviewData) => { next: PreviewData; result: R }, failed: R): Promise<R> => {
      setPending(true);
      setError(null);
      await wait();
      try {
        const { next, result } = fn(loadPreviewData(appId));
        savePreviewData(appId, next);
        setData(next);
        return result;
      } catch (e) {
        setError(e instanceof KitError ? e.message : "うまく保存できませんでした。時間をおいて、もう一度お試しください。");
        return failed;
      } finally {
        setPending(false);
      }
    },
    [appId],
  );

  const create = useCallback(
    (input: unknown) =>
      run<AppDocument | null>((cur) => {
        const value = serialize(input);
        if (cur.docs.length >= APP_DOCUMENTS_MAX_PER_APP) {
          throw new KitError(`このアプリに保存できるのは ${APP_DOCUMENTS_MAX_PER_APP} 件までです。古いものを消してください`);
        }
        const now = new Date().toISOString();
        const doc: AppDocument = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, data: value };
        return { next: { ...cur, docs: [doc, ...cur.docs] }, result: doc };
      }, null),
    [run],
  );

  const update = useCallback(
    (id: string, input: unknown) =>
      run<AppDocument | null>((cur) => {
        const value = serialize(input);
        const old = cur.docs.find((d) => d.id === id);
        if (!old) throw new KitError("文書が見つかりません");
        const doc: AppDocument = { ...old, updatedAt: new Date().toISOString(), data: value };
        return { next: { ...cur, docs: cur.docs.map((d) => (d.id === id ? doc : d)) }, result: doc };
      }, null),
    [run],
  );

  const remove = useCallback(
    (id: string) =>
      run<boolean>((cur) => {
        if (!cur.docs.some((d) => d.id === id)) throw new KitError("文書が見つかりません");
        return { next: { ...cur, docs: cur.docs.filter((d) => d.id !== id) }, result: true };
      }, false),
    [run],
  );

  const setShared = useCallback(
    async (shared: boolean) => {
      setSharingError(null);
      if (!sharingAvailable) {
        setSharingError("このアプリは、お寺との共有に対応していません");
        return false;
      }
      setSharingPending(true);
      await wait();
      const next = { ...loadPreviewData(appId), shared };
      savePreviewData(appId, next);
      setData(next);
      setSharingPending(false);
      return true;
    },
    [appId, sharingAvailable],
  );

  const value = useMemo<Ctx>(
    () => ({
      storage: { docs: data.docs, pending, error, create, update, remove, clearError: () => setError(null) },
      sharing: {
        available: sharingAvailable,
        shared: data.shared,
        pending: sharingPending,
        error: sharingError,
        share: () => setShared(true),
        unshare: () => setShared(false),
      },
    }),
    [data, pending, error, create, update, remove, sharingAvailable, sharingPending, sharingError, setShared],
  );
  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>;
}

function useCtx(name: string): Ctx {
  const c = useContext(StorageContext);
  if (!c) throw new Error(`${name} は、お寺のアプリの画面（App.tsx）の中で使ってください`);
  return c;
}

/** 利用者の文書を読み書きする。T は文書の data の型（アプリが決める） */
export function useAppStorage<T = unknown>(): AppStorage<T> {
  return useCtx("useAppStorage").storage as unknown as AppStorage<T>;
}

/** お寺との共有（文言、デザイン、置き場所はアプリが自由に決める） */
export function useAppSharing(): AppSharing {
  return useCtx("useAppSharing").sharing;
}
