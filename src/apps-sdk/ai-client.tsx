"use client";

// useAppAI（ブラウザ側）と、基盤の AI の同意の画面。spec.md §7「AI」
// 送り先（本体の API / キットの試す画面のサーバー）と、同意の保存先だけを transport で差し替える。
// このファイルは、本体と開発キットで共通（npm run kit:build でコピーする）
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { imageToBase64Jpeg } from "./image";
import { APP_AI_PROVIDER_NOTE, appAIConsentVersion, type AppAI, type AppAIResult, type AppAITasks, type AppManifest } from "./types";

/** 送り先と同意の保存先 */
export type AppAITransport = {
  /** false のときは、AI を使えない（本体の準備中など）。message を返す */
  ready: boolean;
  unavailableMessage?: string;
  getConsent: (version: string) => Promise<boolean>;
  setConsent: (version: string, agreed: boolean) => Promise<boolean>;
  run: (task: string, payload: { text?: string; images?: { base64: string }[] }) => Promise<AppAIResult<unknown>>;
};

type Ctx = { ai: AppAI; showConsent: boolean; revoke: () => Promise<void> };
const AIContext = createContext<Ctx | null>(null);

export function AppAIProvider({
  manifest,
  transport,
  initialConsent,
  children,
}: {
  manifest: AppManifest;
  transport: AppAITransport;
  /** 最初の同意の状態（本体ではサーバーで読んで渡す） */
  initialConsent: boolean;
  children: ReactNode;
}) {
  const available = Boolean(manifest.ai);
  const version = appAIConsentVersion(manifest);
  const [consented, setConsented] = useState(initialConsent);
  const [pending, setPending] = useState(false);
  const [dialog, setDialog] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const requestConsent = useCallback(async () => {
    if (!available || !transport.ready) return false;
    if (consented) return true;
    setDialog(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, [available, transport.ready, consented]);

  const answer = useCallback(
    async (agreed: boolean) => {
      setDialog(false);
      let ok = false;
      if (agreed) ok = await transport.setConsent(version, true);
      setConsented(ok);
      resolver.current?.(ok);
      resolver.current = null;
    },
    [transport, version],
  );

  const run = useCallback(
    async (task: string, input: { text?: string; images?: Blob[] }): Promise<AppAIResult<unknown>> => {
      if (!available) return { ok: false, kind: "unavailable", message: "このアプリは AI を使う設定になっていません（manifest の ai）" };
      if (!transport.ready) return { ok: false, kind: "unavailable", message: transport.unavailableMessage ?? "今は AI を使えません" };
      if (!consented && !(await requestConsent())) {
        return { ok: false, kind: "needs_consent", message: "AI に送ることに同意していないため、使えません" };
      }
      setPending(true);
      try {
        let images: { base64: string }[] | undefined;
        if (input.images?.length) {
          try {
            images = await Promise.all(input.images.map(async (b) => ({ base64: await imageToBase64Jpeg(b) })));
          } catch {
            return { ok: false, kind: "invalid_input", message: "画像を読み込めませんでした" };
          }
        }
        const r = await transport.run(task, { text: input.text, images });
        if (!r.ok && r.kind === "needs_consent") setConsented(false);
        return r;
      } finally {
        setPending(false);
      }
    },
    [available, transport, consented, requestConsent],
  );

  const revoke = useCallback(async () => {
    await transport.setConsent(version, false);
    setConsented(false);
  }, [transport, version]);

  const value = useMemo<Ctx>(
    () => ({
      ai: { available, consented, requestConsent, run: run as AppAI["run"], pending },
      showConsent: dialog,
      revoke,
    }),
    [available, consented, requestConsent, run, pending, dialog, revoke],
  );

  return (
    <AIContext.Provider value={value}>
      {children}
      {dialog && manifest.ai && <AIConsentDialog manifest={manifest} onAnswer={answer} />}
    </AIContext.Provider>
  );
}

/** 基盤の同意の画面（アプリのデザインに関係なく、同じ見た目で出す） */
function AIConsentDialog({ manifest, onAnswer }: { manifest: AppManifest; onAnswer: (agreed: boolean) => void }) {
  const ai = manifest.ai!;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="app-ai-consent-title" className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-lg leading-relaxed text-stone-900 shadow-xl">
        <h2 id="app-ai-consent-title" className="text-xl font-bold">
          AI に送ってもよいですか？
        </h2>
        <p className="mt-3">
          「{manifest.name}」は、{ai.purpose}、次のものを AI（Anthropic 社の Claude）に送ります。
        </p>
        <ul className="mt-2 list-disc pl-6">
          {ai.sends.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="mt-3 text-base text-stone-700">
          送った内容は、このシステム（お寺のアプリ）には保存しません。{APP_AI_PROVIDER_NOTE}同意はいつでもやめられます。同意しなくても、AI を使わない部分は使えます。
        </p>
        <div className="mt-5 grid gap-3">
          <button type="button" onClick={() => onAnswer(true)} className="rounded-xl bg-sky-700 px-5 py-3 text-lg font-bold text-white">
            同意して送る
          </button>
          <button type="button" onClick={() => onAnswer(false)} className="rounded-xl border border-stone-300 px-5 py-3 text-lg">
            送らない
          </button>
        </div>
      </div>
    </div>
  );
}

/** AI を使う。Tasks は ai.ts の defineAppAI の型（例: useAppAI<typeof ai>()） */
export function useAppAI<Tasks extends AppAITasks = AppAITasks>(): AppAI<Tasks> {
  const c = useContext(AIContext);
  if (!c) throw new Error("useAppAI は、お寺のアプリの画面（App.tsx）の中で使ってください");
  return c.ai as unknown as AppAI<Tasks>;
}

/** 基盤の部品が、AI の同意の状態を出したり、同意をやめたりするときに使う（アプリは使わない） */
export function useAppAIConsentControl(): { consented: boolean; available: boolean; revoke: () => Promise<void> } {
  const c = useContext(AIContext);
  return { consented: c?.ai.consented ?? false, available: c?.ai.available ?? false, revoke: c?.revoke ?? (async () => {}) };
}
