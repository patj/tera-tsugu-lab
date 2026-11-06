// ケアのツールの画面の部品。DB に依存しない（サーバーコンポーネントでも、クライアントコンポーネントからでも使える）
import type { ReactNode } from "react";
import { formatJst } from "@/domain/core/time";
import { CRISIS_RESOURCES, EMERGENCY_NOTE } from "./resources";
import type { CareEntryData, CareEntryView, CareField, CareManifest, CareSaveAction } from "./types";

const inputClass = "mt-2 block w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg";

/** 「このツールは診断や治療を行いません」（ケアのすべての画面に出す） */
export function CareDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`rounded-lg bg-stone-100 px-4 py-3 text-base text-stone-700 ${className}`}>
      このツールは、気持ちを書きとめて振り返るためのものです。<strong>診断や治療は行いません。</strong>
      つらさが続くときは、医療機関や下の相談窓口にご相談ください。
    </p>
  );
}

/** 相談窓口。emphasis にすると、危機を検知したとき向けの目立つ表示にする */
export function CrisisResources({ emphasis = false }: { emphasis?: boolean }) {
  return (
    <section
      aria-label="相談窓口"
      className={
        emphasis
          ? "rounded-xl border-2 border-rose-400 bg-rose-50 px-5 py-5"
          : "rounded-xl border border-stone-200 bg-white px-5 py-4"
      }
    >
      <h2 className={`font-bold ${emphasis ? "text-2xl text-rose-900" : "text-xl"}`}>
        {emphasis ? "ひとりで抱えこまず、話してみませんか" : "相談窓口"}
      </h2>
      {emphasis && (
        <p className="mt-2">
          とてもつらい気持ちを書いてくださったのですね。今の気持ちを、専門の相談員に話すことができます。名前を言わなくても大丈夫です。
        </p>
      )}
      <ul className="mt-4 space-y-4">
        {CRISIS_RESOURCES.map((r) => (
          <li key={r.name}>
            <p className="font-bold">{r.name}</p>
            <a href={`tel:${r.telHref}`} className="text-2xl font-bold text-sky-800 underline">
              {r.tel}
            </a>
            <p className="text-base text-stone-700">{r.hours}</p>
            {r.note && <p className="text-base text-stone-600">{r.note}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-4 font-bold">{EMERGENCY_NOTE}</p>
    </section>
  );
}

function FieldInput({ field }: { field: CareField }) {
  const label = (
    <span className="font-bold">
      {field.label}
      {field.required && <span className="ml-1 text-base text-rose-700">（必須）</span>}
    </span>
  );
  const help = field.help && <span className="mt-1 block text-base text-stone-600">{field.help}</span>;
  switch (field.type) {
    case "text":
      return (
        <label className="block">
          {label}
          {help}
          <input name={field.id} type="text" required={field.required} maxLength={field.maxLength ?? 200} placeholder={field.placeholder} className={inputClass} />
        </label>
      );
    case "textarea":
      return (
        <label className="block">
          {label}
          {help}
          <textarea name={field.id} required={field.required} maxLength={field.maxLength ?? 4000} placeholder={field.placeholder} rows={field.rows ?? 6} className={inputClass} />
        </label>
      );
    case "scale": {
      const values = Array.from({ length: field.max - field.min + 1 }, (_, i) => field.min + i);
      return (
        <fieldset>
          <legend>{label}</legend>
          {help}
          <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
            {values.map((v) => (
              <label key={v} className="flex cursor-pointer flex-col items-center rounded-lg border border-stone-300 bg-white px-1 py-3 text-center has-[:checked]:border-sky-600 has-[:checked]:bg-sky-50">
                <input type="radio" name={field.id} value={v} required={field.required} className="mb-1 h-5 w-5" />
                <span className="text-xl font-bold">{v}</span>
                {field.labels?.[v] && <span className="text-sm leading-tight text-stone-700">{field.labels[v]}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case "choice":
      return (
        <fieldset>
          <legend>{label}</legend>
          {help}
          <div className="mt-2 space-y-2">
            {field.options.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-300 bg-white px-4 py-3 has-[:checked]:border-sky-600 has-[:checked]:bg-sky-50">
                <input type="radio" name={field.id} value={o.value} required={field.required} className="h-5 w-5" />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
  }
}

/** manifest の項目から、記録のフォームを作る。action は本体から受け取ったものをそのまま渡す */
export function CareEntryForm({
  manifest,
  action,
  submitLabel = "記録する",
  children,
}: {
  manifest: CareManifest;
  action: CareSaveAction;
  submitLabel?: string;
  /** フォームの先頭に出す案内 */
  children?: ReactNode;
}) {
  return (
    <form action={action} className="space-y-6">
      {children}
      {manifest.fields.map((f) => (
        <FieldInput key={f.id} field={f} />
      ))}
      <button type="submit" className="w-full rounded-xl bg-sky-700 px-5 py-4 text-xl font-bold text-white">
        {submitLabel}
      </button>
    </form>
  );
}

/** 項目の値を、画面に出す言葉にする（段階はラベル、選択肢は選択肢の言葉） */
export function formatCareValue(field: CareField, value: CareEntryData[string]): string {
  if (value === undefined || value === "") return "—";
  if (field.type === "scale") {
    const label = field.labels?.[Number(value)];
    return label ? `${value}（${label}）` : `${value} / ${field.max}`;
  }
  if (field.type === "choice") return field.options.find((o) => o.value === value)?.label ?? String(value);
  return String(value);
}

/** 記録の日時（日本時間） */
export function formatCareDate(d: Date): string {
  return formatJst(d);
}

/** 記録の一覧（すべての項目を並べる）。History や AdminView でそのまま使える */
export function CareEntryList({
  manifest,
  entries,
  empty = "まだ記録はありません。",
  showCrisis = false,
}: {
  manifest: CareManifest;
  entries: CareEntryView[];
  empty?: string;
  /** 危機の印を出すか（管理画面向け） */
  showCrisis?: boolean;
}) {
  if (entries.length === 0) return <p className="text-stone-600">{empty}</p>;
  return (
    <ul className="space-y-4">
      {entries.map((e) => (
        <li key={e.id} className={`rounded-xl border bg-white px-5 py-4 ${showCrisis && e.crisis ? "border-rose-400" : "border-stone-200"}`}>
          <p className="text-base text-stone-600">
            {formatCareDate(e.createdAt)}
            {showCrisis && e.crisis && <span className="ml-2 rounded bg-rose-100 px-2 py-0.5 text-sm font-bold text-rose-900">危機の兆候</span>}
          </p>
          <dl className="mt-2 space-y-2">
            {manifest.fields.map((f) => (
              <div key={f.id}>
                <dt className="text-base font-bold text-stone-700">{f.label}</dt>
                <dd className="whitespace-pre-wrap">{formatCareValue(f, e.data[f.id])}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}
