"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="block">
        <span className="block font-medium">メールアドレス</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="block font-medium">パスワード</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2"
        />
      </label>
      {state.error && <p className="text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-stone-800 px-4 py-3 font-medium text-white disabled:opacity-60"
      >
        {pending ? "ログインしています…" : "ログイン"}
      </button>
    </form>
  );
}
