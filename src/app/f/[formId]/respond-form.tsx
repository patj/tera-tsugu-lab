"use client";

import { useActionState, useState } from "react";
import type { RespondentForm, RespondentItemField, RespondentQuestion } from "@/domain/forms";
import { submitPublicForm, type SubmitState } from "./actions";

type PersonRow = { personId: string; values: Record<string, string> };
type Value = string | string[] | PersonRow[];

const inputClass = "mt-2 w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg";

function emptyRow(): PersonRow {
  return { personId: "", values: {} };
}

function initialValues(form: RespondentForm): Record<string, Value> {
  const v: Record<string, Value> = {};
  for (const q of form.questions) {
    if (q.type === "person_list") v[q.id] = [emptyRow()];
    else if (q.type === "multi") v[q.id] = [];
    else v[q.id] = "";
  }
  return v;
}

/** 送信する形にする（person_list の空の行と、家族を選んでいない行の personId を省く） */
function toAnswers(form: RespondentForm, values: Record<string, Value>) {
  const out: Record<string, unknown> = {};
  for (const q of form.questions) {
    const v = values[q.id];
    if (q.type === "person_list") {
      out[q.id] = (v as PersonRow[]).map((r) => (r.personId ? { personId: r.personId, values: r.values } : { values: r.values }));
    } else {
      out[q.id] = v;
    }
  }
  return out;
}

function Required({ on }: { on: boolean }) {
  return on ? <span className="ml-2 rounded bg-red-700 px-1.5 py-0.5 text-sm text-white">必須</span> : null;
}

function ScalarInput({
  type,
  options,
  value,
  onChange,
  name,
}: {
  type: string;
  options: string[] | null | undefined;
  value: string;
  onChange: (v: string) => void;
  name: string;
}) {
  if (type === "long") {
    return <textarea className={inputClass} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  if (type === "single") {
    return (
      <div className="mt-2 flex flex-wrap gap-3">
        {(options ?? []).map((o) => (
          <label key={o} className="flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3">
            <input type="radio" name={name} className="size-5" checked={value === o} onChange={() => onChange(o)} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  return (
    <input
      className={inputClass}
      type={type === "date" ? "date" : type === "number" ? "number" : "text"}
      inputMode={type === "number" ? "numeric" : undefined}
      min={type === "number" ? 0 : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function PersonListInput({
  q,
  rows,
  onChange,
}: {
  q: RespondentQuestion;
  rows: PersonRow[];
  onChange: (rows: PersonRow[]) => void;
}) {
  const fields = q.itemFields ?? [];
  const max = q.maxPersons ?? 1;
  const hasFamily = q.candidates.length > 0;

  const update = (i: number, row: PersonRow) => onChange(rows.map((r, j) => (j === i ? row : r)));

  // 家族を選ぶと、台帳にある項目を入れる（台帳にない項目は、入力済みの値を残す）
  const pickFamily = (i: number, personId: string) => {
    const keep: Record<string, string> = {};
    for (const f of fields) if (!f.autoFill && rows[i].values[f.key]) keep[f.key] = rows[i].values[f.key];
    const c = q.candidates.find((x) => x.personId === personId);
    update(i, { personId, values: c ? { ...keep, ...c.values } : keep });
  };

  const isLocked = (row: PersonRow, f: RespondentItemField) =>
    Boolean(row.personId && f.autoFill && q.candidates.find((c) => c.personId === row.personId)?.values[f.key]);

  return (
    <div className="mt-3 space-y-4">
      {rows.map((row, i) => (
        <div key={i} className="rounded-lg border border-stone-300 bg-stone-50 px-4 py-4">
          <div className="flex items-center justify-between">
            <span className="font-bold">
              {q.label}（{i + 1} 人目）
            </span>
            {rows.length > 1 && (
              <button type="button" className="text-base text-stone-600 underline" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                この方を消す
              </button>
            )}
          </div>
          {hasFamily && (
            <label className="mt-3 block">
              <span className="block">ご家族から選ぶ</span>
              <select className={inputClass} value={row.personId} onChange={(e) => pickFamily(i, e.target.value)}>
                <option value="">ご家族以外の方（入力する）</option>
                {q.candidates.map((c) => (
                  <option key={c.personId} value={c.personId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {fields.map((f) => (
            <div key={f.key} className="mt-3">
              <span className="block">
                {f.label}
                <Required on={Boolean(f.required)} />
              </span>
              {isLocked(row, f) ? (
                <p className="mt-2 rounded-lg bg-white px-4 py-3 text-stone-700">
                  {row.values[f.key]} <span className="text-sm text-stone-500">（お寺の台帳から）</span>
                </p>
              ) : (
                <ScalarInput
                  type={f.type}
                  options={f.options}
                  name={`${q.id}-${i}-${f.key}`}
                  value={row.values[f.key] ?? ""}
                  onChange={(v) => update(i, { ...row, values: { ...row.values, [f.key]: v } })}
                />
              )}
            </div>
          ))}
        </div>
      ))}
      {rows.length < max && (
        <button
          type="button"
          className="w-full rounded-lg border-2 border-dashed border-stone-400 px-4 py-3 text-stone-700"
          onClick={() => onChange([...rows, emptyRow()])}
        >
          ＋ もう 1 人追加する（{max} 人まで）
        </button>
      )}
    </div>
  );
}

export function RespondForm({ form, token }: { form: RespondentForm; token: string | null }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitPublicForm, {});
  const [values, setValues] = useState<Record<string, Value>>(() => initialValues(form));
  const set = (id: string, v: Value) => setValues((prev) => ({ ...prev, [id]: v }));

  return (
    <form action={action} className="mt-8 space-y-8">
      <input type="hidden" name="formId" value={form.id} />
      {token && <input type="hidden" name="t" value={token} />}
      <input type="hidden" name="answers" value={JSON.stringify(toAnswers(form, values))} />

      {form.questions.map((q) => (
        <fieldset key={q.id}>
          <legend className="font-bold">
            {q.label}
            <Required on={q.required} />
          </legend>
          {q.description && <p className="mt-1 text-base text-stone-600">{q.description}</p>}
          {q.type === "person_list" ? (
            <PersonListInput q={q} rows={values[q.id] as PersonRow[]} onChange={(rows) => set(q.id, rows)} />
          ) : q.type === "multi" ? (
            <div className="mt-2 flex flex-wrap gap-3">
              {(q.options ?? []).map((o) => {
                const picked = values[q.id] as string[];
                return (
                  <label key={o} className="flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={picked.includes(o)}
                      onChange={(e) => set(q.id, e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))}
                    />
                    {o}
                  </label>
                );
              })}
            </div>
          ) : (
            <ScalarInput type={q.type} options={q.options} name={q.id} value={values[q.id] as string} onChange={(v) => set(q.id, v)} />
          )}
        </fieldset>
      ))}

      {state.error && <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-stone-800 px-4 py-4 text-xl font-bold text-white disabled:opacity-60"
      >
        {pending ? "送信しています…" : "送信する"}
      </button>
    </form>
  );
}
