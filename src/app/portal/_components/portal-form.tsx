"use client";

// ポータルのフォーム。<form method="post"> のまま送れる（JavaScript がなくても動く）。
// JavaScript があれば fetch で送り、エラーをその場で表示して、入力した内容を残す
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export function PortalForm({
  action,
  children,
  submitLabel,
  pendingLabel = "送っています…",
  className = "space-y-6",
  danger = false,
}: {
  action: string;
  children: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  danger?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(action, {
        method: "POST",
        body: new FormData(e.currentTarget),
        headers: { Accept: "application/json" },
      });
      const data = (await res.json()) as { ok: boolean; redirect?: string; error?: string };
      if (data.ok && data.redirect) {
        router.push(data.redirect);
        router.refresh();
      } else if (res.status === 401) {
        router.push("/portal/login");
      } else {
        setError(data.error ?? "うまく送れませんでした。");
      }
    } catch {
      setError("通信できませんでした。電波のよいところで、もう一度お試しください。");
    }
    setPending(false);
  }

  return (
    <form method="post" action={action} onSubmit={onSubmit} className={className}>
      {children}
      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={`w-full rounded-xl px-4 py-4 text-xl font-bold text-white disabled:opacity-60 ${danger ? "bg-red-800" : "bg-stone-800"}`}
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
