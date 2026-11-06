"use client";

// useAppAssets: apps/<app-id>/assets/ の素材を使う。spec.md §7「素材」
// 本体は /app-assets/<app-id>/、開発キットは /apps/<app-id>/assets/ から配信する（baseUrl で差し替える）。
// このファイルは、本体と開発キットで共通（npm run kit:build でコピーする）
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { normalizeAssetPath, type AppAssets } from "./types";

const AssetsContext = createContext<AppAssets | null>(null);

export function AppAssetsProvider({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const value = useMemo<AppAssets>(() => {
    const cache = new Map<string, Promise<string>>();
    const url = (path: string) => `${baseUrl.replace(/\/$/, "")}/${normalizeAssetPath(path)}`;
    return {
      url,
      dataUrl: (path: string) => {
        const u = url(path);
        let p = cache.get(u);
        if (!p) {
          p = fetch(u)
            .then((r) => {
              if (!r.ok) throw new Error(`素材を読み込めませんでした: ${path}`);
              return r.blob();
            })
            .then(
              (b) =>
                new Promise<string>((resolve, reject) => {
                  const fr = new FileReader();
                  fr.onload = () => resolve(String(fr.result));
                  fr.onerror = () => reject(new Error(`素材を読み込めませんでした: ${path}`));
                  fr.readAsDataURL(b);
                }),
            );
          p.catch(() => cache.delete(u));
          cache.set(u, p);
        }
        return p;
      },
    };
  }, [baseUrl]);
  return <AssetsContext.Provider value={value}>{children}</AssetsContext.Provider>;
}

/** 素材を使う（例: assets.url("img/door.webp")） */
export function useAppAssets(): AppAssets {
  const c = useContext(AssetsContext);
  if (!c) throw new Error("useAppAssets は、お寺のアプリの画面（App.tsx）の中で使ってください");
  return c;
}
