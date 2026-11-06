"use client";

// 基盤の帯に出す、AI に送ることへの同意の状態と、同意をやめるボタン（AI を使うアプリで、同意しているときだけ）。spec.md §7「AI」
import { useState } from "react";
import { useAppAIConsentControl } from "@/apps-sdk/ai-client";

export function AiConsentStatus() {
  const { available, consented, revoke } = useAppAIConsentControl();
  const [busy, setBusy] = useState(false);
  if (!available || !consented) return null;
  return (
    <span className="flex items-center gap-2 text-base">
      <span className="whitespace-nowrap rounded-full bg-sky-100 px-3 py-1 text-sm font-bold text-sky-900">AI に送る: 同意中</span>
      <button
        type="button"
        disabled={busy}
        className="underline disabled:opacity-50"
        onClick={async () => {
          if (!confirm("AI に送ることへの同意をやめますか？（AI を使う部分は、同意し直すまで使えません）")) return;
          setBusy(true);
          await revoke();
          setBusy(false);
        }}
      >
        やめる
      </button>
    </span>
  );
}
