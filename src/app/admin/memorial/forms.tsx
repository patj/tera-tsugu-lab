"use client";

import { useActionState } from "react";
import { bookAction, cancelAction, declineAction, type ActionState } from "./actions";

// このファイルはブラウザでも動くので、ドメイン層（DB を使う）は import しない
const button = "rounded bg-stone-800 px-5 py-2.5 text-lg font-medium text-white hover:bg-stone-700 disabled:opacity-60";

function Message({ state }: { state: ActionState }) {
  if (state.error) return <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800">{state.error}</p>;
  if (state.message) return <p className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900">{state.message}</p>;
  return null;
}

/** 法要を確定するフォーム。候補の日時（SlotPicker）や隠しフィールドは children で渡す */
export function BookForm({ children, submitLabel = "この日時で確定する" }: { children: React.ReactNode; submitLabel?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(bookAction, {});
  return (
    <form action={action} className="space-y-4">
      {children}
      <div>
        <button type="submit" disabled={pending} className={button}>
          {pending ? "登録しています…" : submitLabel}
        </button>
        <p className="mt-1 text-sm text-stone-600">法要、担当者の予定、本堂の予約（お寺のとき）、申し込みがまとめて登録されます。</p>
        <Message state={state} />
      </div>
    </form>
  );
}

export function DeclineForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(declineAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="block font-medium">お断りの理由（ポータルで檀家さんに表示されます）</span>
        <textarea
          name="reason"
          required
          rows={3}
          className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2"
          placeholder="例: ご希望の時期は本山の行事のため、お伺いできません。お電話でご相談させてください"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-red-700 px-5 py-2.5 text-lg text-red-800 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "送っています…" : "お断りする"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function CancelServiceForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(cancelAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("この法要を取り消します。担当者の予定と本堂の予約も取り消されます。よろしいですか？")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-red-700 px-5 py-2.5 text-lg text-red-800 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "取り消しています…" : "法要を取り消す"}
      </button>
      <Message state={state} />
    </form>
  );
}
