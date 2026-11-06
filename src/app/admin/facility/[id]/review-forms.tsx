"use client";

import { useActionState } from "react";
import { approveAction, cancelAction, rejectAction, type ActionState } from "../actions";

function Message({ state }: { state: ActionState }) {
  if (state.error) return <p className="mt-2 text-red-700">{state.error}</p>;
  if (state.message) return <p className="mt-2 text-emerald-800">{state.message}</p>;
  return null;
}

export function ApproveForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approveAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-sky-700 px-5 py-3 text-lg font-medium text-white hover:bg-sky-800 disabled:opacity-60"
      >
        {pending ? "承認しています…" : "承認する（確定にする）"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function RejectForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(rejectAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="block font-medium">お断りの理由（申請者に表示されます）</span>
        <textarea
          name="reason"
          required
          rows={3}
          className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2"
          placeholder="例: その日は法要が入っているため、お受けできません。別の日でご相談ください"
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

export function CancelForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(cancelAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("この予約を取り消しますか？")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-stone-400 px-4 py-2 text-stone-700 hover:bg-stone-50 disabled:opacity-60"
      >
        {pending ? "取り消しています…" : "予約を取り消す"}
      </button>
      <Message state={state} />
    </form>
  );
}
