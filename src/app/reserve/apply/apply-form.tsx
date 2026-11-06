"use client";

import { useActionState, useState } from "react";
import { applyAction, type ApplyState } from "../actions";

type Props = {
  facilities: { id: string; name: string }[];
  kinds: { value: string; label: string }[];
  periods: { value: string; label: string }[];
  timeOptions: string[];
  minDate: string;
  maxDate: string;
  initial: Record<string, string>;
};

const input = "mt-1 w-full rounded border border-stone-300 bg-white px-3 py-3 text-lg";

export function ApplyForm(props: Props) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyAction, {});
  const v = state.values ?? props.initial;
  // 送ったあとに React がフォームを空に戻すので、入力した値で作り直す
  return <Fields key={JSON.stringify(v)} {...props} values={v} state={state} action={action} pending={pending} />;
}

function Fields({
  facilities,
  kinds,
  periods,
  timeOptions,
  minDate,
  maxDate,
  values: v,
  state,
  action,
  pending,
}: Props & { values: Record<string, string>; state: ApplyState; action: (fd: FormData) => void; pending: boolean }) {
  const [period, setPeriod] = useState(v.period || "am");
  return (
    <form action={action} className="space-y-6">
      <label className="block">
        <span className="block font-bold">施設</span>
        <select name="facilityId" required defaultValue={v.facilityId} className={input}>
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="font-bold">ご利用の種類</legend>
        <div className="mt-2 space-y-2">
          {kinds.map((k) => (
            <label key={k.value} className="flex items-center gap-3 rounded border border-stone-200 bg-white px-3 py-3">
              <input type="radio" name="kind" value={k.value} required defaultChecked={v.kind === k.value} className="h-5 w-5" />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="block font-bold">ご利用の日</span>
        <input type="date" name="date" required min={minDate} max={maxDate} defaultValue={v.date} className={input} />
        <span className="mt-1 block text-base text-stone-600">翌日以降の日を選んでください。</span>
      </label>

      <fieldset>
        <legend className="font-bold">時間帯</legend>
        <div className="mt-2 space-y-2">
          {periods.map((p) => (
            <label key={p.value} className="flex items-center gap-3 rounded border border-stone-200 bg-white px-3 py-3">
              <input
                type="radio"
                name="period"
                value={p.value}
                checked={period === p.value}
                onChange={() => setPeriod(p.value)}
                className="h-5 w-5"
              />
              {p.label}
            </label>
          ))}
        </div>
        {period === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-base">始まり</span>
              <select name="startTime" defaultValue={v.startTime || "10:00"} className={input}>
                {timeOptions.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-base">終わり</span>
              <select name="endTime" defaultValue={v.endTime || "12:00"} className={input}>
                {timeOptions.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <span className="mt-1 block text-base text-stone-600">準備と片付けの時間も含めてください。</span>
      </fieldset>

      <label className="block">
        <span className="block font-bold">お名前</span>
        <input name="name" required maxLength={100} autoComplete="name" defaultValue={v.name} className={input} />
      </label>
      <label className="block">
        <span className="block font-bold">電話番号</span>
        <input
          name="phone"
          type="tel"
          required
          maxLength={20}
          autoComplete="tel"
          inputMode="tel"
          defaultValue={v.phone}
          className={input}
        />
      </label>
      <label className="block">
        <span className="block font-bold">
          メールアドレス <span className="font-normal text-stone-600">（任意）</span>
        </span>
        <input name="email" type="email" maxLength={200} autoComplete="email" defaultValue={v.email} className={input} />
      </label>
      <label className="block">
        <span className="block font-bold">
          ご利用の内容 <span className="font-normal text-stone-600">（人数、ご希望など）</span>
        </span>
        <textarea name="notes" rows={4} maxLength={2000} defaultValue={v.notes} className={input} />
      </label>

      {state.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-3 text-red-800">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-stone-800 px-4 py-4 text-xl font-bold text-white disabled:opacity-60"
      >
        {pending ? "送っています…" : "申請する"}
      </button>
      <p className="text-base text-stone-600">
        申請した時点では仮押さえです。お寺が確認して承認すると確定します。申請のあとに表示される申請番号で、状況を確かめられます。
      </p>
    </form>
  );
}
