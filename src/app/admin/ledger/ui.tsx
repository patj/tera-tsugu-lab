// 台帳の管理画面の共通の部品（Server Components）
import Link from "next/link";
import type { ReactNode } from "react";
import { GENDER_LABELS, type Gender, type PersonDetail } from "@/domain/ledger";

export const inputClass = "mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2";
export const buttonClass = "rounded bg-stone-800 px-4 py-2 font-medium text-white hover:bg-stone-700";
export const subButtonClass = "rounded border border-stone-300 bg-white px-4 py-2 hover:bg-stone-50";
export const linkClass = "text-blue-800 underline hover:text-blue-600";

/** searchParams の 1 つの値を文字列にする */
export function param(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
}

export function Notice({ error, done }: { error?: string; done?: string }) {
  return (
    <>
      {error && <p className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">{error}</p>}
      {done && <p className="mb-4 rounded border border-green-300 bg-green-50 px-4 py-3 text-green-800">{done}</p>}
    </>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-stone-500">{hint}</span>}
    </label>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-1">
        <h2 className="text-xl font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Badge({ children, tone = "stone" }: { children: ReactNode; tone?: "stone" | "amber" | "blue" | "red" }) {
  const tones = {
    stone: "bg-stone-100 text-stone-700 border-stone-300",
    amber: "bg-amber-50 text-amber-800 border-amber-300",
    blue: "bg-blue-50 text-blue-800 border-blue-300",
    red: "bg-red-50 text-red-800 border-red-300",
  };
  return <span className={`inline-block rounded border px-2 py-0.5 text-sm ${tones[tone]}`}>{children}</span>;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${linkClass} text-base`}>
      ← {children}
    </Link>
  );
}

export function genderLabel(g: string | null): string {
  return g ? (GENDER_LABELS[g as Gender] ?? g) : "";
}

/** 個人の入力欄（作成と編集で共通） */
export function PersonFields({
  person,
  homyoLabel,
  deceasedDefault = false,
}: {
  person?: Partial<PersonDetail>;
  homyoLabel: string;
  deceasedDefault?: boolean;
}) {
  const isDeceased = person?.isDeceased ?? deceasedDefault;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="姓">
          <input name="familyName" required defaultValue={person?.familyName ?? ""} className={inputClass} />
        </Field>
        <Field label="名">
          <input name="givenName" required defaultValue={person?.givenName ?? ""} className={inputClass} />
        </Field>
        <Field label="カナ" hint="例: やまだ たろう">
          <input name="kana" defaultValue={person?.kana ?? ""} className={inputClass} />
        </Field>
        <Field label="続柄" hint="世帯主から見た関係（本人、妻、長男、父など）">
          <input name="relation" defaultValue={person?.relation ?? ""} className={inputClass} />
        </Field>
        <Field label="性別">
          <select name="gender" defaultValue={person?.gender ?? ""} className={inputClass}>
            <option value="">―</option>
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </Field>
        <Field label="生年月日">
          <input name="birthDate" type="date" defaultValue={person?.birthDate ?? ""} className={inputClass} />
        </Field>
        <Field label="携帯番号">
          <input name="mobilePhone" defaultValue={person?.mobilePhone ?? ""} className={inputClass} />
        </Field>
        <Field label="メール">
          <input name="email" type="email" defaultValue={person?.email ?? ""} className={inputClass} />
        </Field>
      </div>

      <fieldset className="rounded border border-stone-300 p-4">
        <legend className="px-2 font-medium">故人の情報</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isDeceased" defaultChecked={isDeceased} className="h-5 w-5" />
          故人（過去帳に載せる）
        </label>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label={homyoLabel}>
            <input name="homyo" defaultValue={person?.homyo ?? ""} className={inputClass} />
          </Field>
          <Field label="没年月日">
            <input name="deathDate" type="date" defaultValue={person?.deathDate ?? ""} className={inputClass} />
          </Field>
          <Field label="享年（行年）">
            <input
              name="ageAtDeath"
              type="number"
              min={0}
              max={130}
              defaultValue={person?.ageAtDeath ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <Field label="備考">
        <textarea name="notes" rows={2} defaultValue={person?.notes ?? ""} className={inputClass} />
      </Field>
    </div>
  );
}
