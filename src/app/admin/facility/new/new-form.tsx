"use client";

import { useActionState } from "react";
import { createAction, type ActionState } from "../actions";

type Props = {
  facilities: { id: string; name: string }[];
  kinds: { value: string; label: string }[];
  defaultDate: string;
};

const input = "mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2";

export function NewReservationForm(props: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createAction, {});
  const v = state.values ?? {};
  // 送ったあとに React がフォームを空に戻すので、エラーのときは入力した値で作り直す
  return <Fields key={JSON.stringify(v)} {...props} v={v} state={state} action={action} pending={pending} />;
}

function Fields({
  facilities,
  kinds,
  defaultDate,
  v,
  state,
  action,
  pending,
}: Props & { v: Record<string, string>; state: ActionState; action: (fd: FormData) => void; pending: boolean }) {
  return (
    <form action={action} className="max-w-2xl space-y-5 text-lg">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="block font-medium">施設</span>
          <select name="facilityId" required defaultValue={v.facilityId} className={input}>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block font-medium">種類</span>
          <select name="kind" required defaultValue={v.kind} className={input}>
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="block font-medium">日付</span>
          <input type="date" name="date" required defaultValue={v.date || defaultDate} className={input} />
        </label>
        <label className="block">
          <span className="block font-medium">始まり</span>
          <input type="time" name="startTime" required defaultValue={v.startTime || "10:00"} step={300} className={input} />
        </label>
        <label className="block">
          <span className="block font-medium">終わり</span>
          <input type="time" name="endTime" required defaultValue={v.endTime || "12:00"} step={300} className={input} />
        </label>
      </div>
      <p className="text-base text-stone-600">準備と片付けの時間も含めてください。</p>
      <fieldset>
        <legend className="font-medium">状態</legend>
        <div className="mt-1 flex gap-6">
          <label className="flex items-center gap-2">
            <input type="radio" name="status" value="confirmed" defaultChecked={v.status !== "pending"} /> 確定
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="status" value="pending" defaultChecked={v.status === "pending"} /> 申請中（仮押さえ）
          </label>
        </div>
      </fieldset>
      <label className="block">
        <span className="block font-medium">件名</span>
        <input name="title" maxLength={100} defaultValue={v.title} placeholder="例: 佐藤様 前撮り" className={input} />
      </label>
      <fieldset className="rounded border border-stone-200 px-4 py-3">
        <legend className="px-1 font-medium">申込者（一般の方。わかれば）</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="block text-base">氏名</span>
            <input name="contactName" maxLength={100} defaultValue={v.contactName} className={input} />
          </label>
          <label className="block">
            <span className="block text-base">電話</span>
            <input name="contactPhone" type="tel" maxLength={30} defaultValue={v.contactPhone} className={input} />
          </label>
          <label className="block">
            <span className="block text-base">メール</span>
            <input name="contactEmail" type="email" maxLength={200} defaultValue={v.contactEmail} className={input} />
          </label>
        </div>
      </fieldset>
      <label className="block">
        <span className="block font-medium">内容・メモ</span>
        <textarea name="notes" rows={3} maxLength={2000} defaultValue={v.notes} className={input} />
      </label>
      {state.error && <p className="text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-stone-800 px-6 py-3 font-medium text-white hover:bg-stone-700 disabled:opacity-60"
      >
        {pending ? "登録しています…" : "登録する"}
      </button>
    </form>
  );
}
