"use client";
// 予定の登録と編集のフォーム（私的 / 業務、担当者、カテゴリ）
import { useActionState, useState } from "react";
import { cancelEventAction, saveEvent, type EventFormState } from "../actions";

export type FormStaff = { id: string; name: string; roleTitle: string; isOfficiant: boolean; canLogin: boolean };

export type EventFormValues = {
  visibility: "private" | "shared";
  category: string;
  title: string;
  body: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  assigneeStaffIds: string[];
};

const ALL_CATEGORIES = ["法要", "行事", "外出", "来客", "その他", "私用"];
const SHARED_CATEGORIES = ["法要", "行事", "外出", "来客", "その他"];

const inputCls = "mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2";

export function EventForm({
  eventId,
  staff,
  initial,
  currentStaffId,
}: {
  eventId?: string;
  staff: FormStaff[];
  initial: EventFormValues;
  currentStaffId: string;
}) {
  const [state, action, pending] = useActionState<EventFormState, FormData>(saveEvent, {});
  const [visibility, setVisibility] = useState(initial.visibility);
  const [category, setCategory] = useState(initial.category);
  const categories = visibility === "shared" ? SHARED_CATEGORIES : ALL_CATEGORIES;
  const editing = Boolean(eventId);

  return (
    <form action={action} className="space-y-6">
      {eventId && <input type="hidden" name="eventId" value={eventId} />}

      <fieldset>
        <legend className="font-medium">予定の種類</legend>
        {editing ? (
          <p className="mt-1">
            {visibility === "private" ? "私的な予定（内容は自分だけが見られます）" : "業務の予定（スタッフ全員が見られます）"}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-4">
            {(
              [
                ["shared", "業務の予定", "スタッフ全員が内容を見られます"],
                ["private", "私的な予定", "ほかの人には「予定あり」と時間だけが見えます"],
              ] as const
            ).map(([value, label, note]) => (
              <label key={value} className="flex cursor-pointer items-start gap-2 rounded border border-stone-300 bg-white px-3 py-2">
                <input
                  type="radio"
                  name="visibility"
                  value={value}
                  checked={visibility === value}
                  onChange={() => {
                    setVisibility(value);
                    if (value === "private") setCategory("私用");
                    else if (category === "私用") setCategory("その他");
                  }}
                  className="mt-1.5"
                />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-sm text-stone-600">{note}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <label className="block">
        <span className="font-medium">カテゴリ</span>
        <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="font-medium">タイトル</span>
        <input name="title" defaultValue={initial.title} required maxLength={100} className={inputCls} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-medium">始まりの日</span>
          <input type="date" name="startDate" defaultValue={initial.startDate} required className={inputCls} />
        </label>
        <label className="block">
          <span className="font-medium">始まりの時刻</span>
          <input type="time" name="startTime" defaultValue={initial.startTime} required step={300} className={inputCls} />
        </label>
        <label className="block">
          <span className="font-medium">終わりの日</span>
          <input type="date" name="endDate" defaultValue={initial.endDate} required className={inputCls} />
        </label>
        <label className="block">
          <span className="font-medium">終わりの時刻</span>
          <input type="time" name="endTime" defaultValue={initial.endTime} required step={300} className={inputCls} />
        </label>
      </div>

      {visibility === "shared" ? (
        <fieldset>
          <legend className="font-medium">担当者（複数選べます）</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {staff.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded border border-stone-300 bg-white px-3 py-2">
                <input type="checkbox" name="assignees" value={s.id} defaultChecked={initial.assigneeStaffIds.includes(s.id)} />
                {s.isOfficiant && (
                  <span
                    role="img"
                    aria-label="法要の担当者"
                    title="法要の担当者"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-700 text-xs font-bold text-white"
                  >
                    法
                  </span>
                )}
                <span>
                  <span className="text-sm text-stone-500">{s.roleTitle}</span> {s.name}
                  {s.id === currentStaffId && <span className="text-sm text-stone-500">（自分）</span>}
                  {!s.canLogin && <span className="block text-xs text-stone-500">ログインしない人</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="rounded bg-stone-100 px-3 py-2 text-stone-700">私的な予定は、自分（ログインしている人）の予定になります。</p>
      )}

      <label className="block">
        <span className="font-medium">内容（メモ）</span>
        <textarea name="body" defaultValue={initial.body} rows={4} maxLength={2000} className={inputCls} />
      </label>

      {state.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-stone-800 px-4 py-3 text-lg font-medium text-white disabled:opacity-60 sm:w-auto"
      >
        {pending ? "保存しています…" : editing ? "変更を保存" : "登録する"}
      </button>
    </form>
  );
}

export function CancelEventButton({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState<EventFormState, FormData>(cancelEventAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("この予定を取り消しますか？")) e.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="eventId" value={eventId} />
      {state.error && (
        <p role="alert" className="text-red-800">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-red-300 bg-white px-4 py-2 text-red-800 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "取り消しています…" : "この予定を取り消す"}
      </button>
    </form>
  );
}
