// フォームの集計と回答の一覧。回答と名簿の CSV
import { notFound } from "next/navigation";
import { isDomainError } from "@/domain/core";
import {
  MODE_LABELS,
  SOURCE_LABELS,
  formUrl,
  getFormResults,
  listResponses,
  summarizeResults,
  type FormStatus,
  type Tally,
} from "@/domain/forms";
import { getStaffActor } from "@/lib/staff-auth";
import { setStatusAction } from "../actions";
import { ErrorBanner, FormTabs, StatusBadge } from "../ui";

const STATUS_BUTTONS: Record<FormStatus, { status: FormStatus; label: string }[]> = {
  draft: [{ status: "open", label: "受付を始める" }],
  open: [{ status: "closed", label: "締め切る" }],
  closed: [{ status: "open", label: "受付を再開する" }],
};

function TallyCells({ t, unit }: { t: Tally; unit: string }) {
  return (
    <>
      <td className="px-3 py-2 text-right">
        {t.member} {unit}
      </td>
      <td className="px-3 py-2 text-right">
        {t.public} {unit}
      </td>
      <td className="px-3 py-2 text-right font-bold">
        {t.total} {unit}
      </td>
    </>
  );
}

export default async function FormResultsPage({ params, searchParams }: PageProps<"/admin/forms/[formId]">) {
  const { formId } = await params;
  const { error } = await searchParams;
  const actor = await getStaffActor();
  let results;
  try {
    results = await getFormResults(actor, formId);
  } catch (e) {
    if (isDomainError(e) && e.code === "not_found") notFound();
    throw e;
  }
  const { rows } = await listResponses(actor, formId);
  const form = results.form;
  const back = `/admin/forms/${form.id}`;

  const tallyRows: { label: string; t: Tally; unit: string }[] = [{ label: "回答", t: results.responses, unit: "件" }];
  for (const q of results.questions) {
    if (q.persons) tallyRows.push({ label: `${q.label}（人数）`, t: q.persons, unit: "人" });
    if (q.sum) tallyRows.push({ label: `${q.label}（合計）`, t: q.sum, unit: "" });
    for (const o of q.options ?? []) tallyRows.push({ label: `${q.label}: ${o.option}`, t: o.count, unit: "件" });
  }

  return (
    <div className="text-lg">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{form.title}</h1>
        <StatusBadge status={form.status} />
      </div>
      <p className="mt-1 text-base text-stone-600">公開範囲: {MODE_LABELS[form.mode]}</p>
      <FormTabs form={form} current="results" />

      <div className="mt-6">
        <ErrorBanner error={error} />
      </div>

      <section className="flex flex-wrap items-center gap-3">
        {STATUS_BUTTONS[form.status].map((b) => (
          <form key={b.status} action={setStatusAction.bind(null, form.id, b.status, back)}>
            <button type="submit" className="rounded bg-stone-800 px-4 py-2 font-medium text-white">
              {b.label}
            </button>
          </form>
        ))}
        {form.status !== "draft" && form.mode !== "members" && (
          <p className="text-base">
            共通リンク:{" "}
            <a href={`/f/${form.id}`} className="break-all underline" target="_blank" rel="noreferrer">
              {formUrl(form.id)}
            </a>
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold">集計</h2>
        <p className="mt-1">{summarizeResults(results)}</p>
        <table className="mt-3 w-full max-w-3xl border-collapse bg-white">
          <thead>
            <tr className="border-b border-stone-300 text-left text-base text-stone-600">
              <th className="px-3 py-2">項目</th>
              <th className="px-3 py-2 text-right">檀家</th>
              <th className="px-3 py-2 text-right">一般</th>
              <th className="px-3 py-2 text-right">合計</th>
            </tr>
          </thead>
          <tbody>
            {tallyRows.map((r, i) => (
              <tr key={i} className="border-b border-stone-200">
                <td className="px-3 py-2">{r.label}</td>
                <TallyCells t={r.t} unit={r.unit} />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={`/admin/forms/${form.id}/csv/responses`} className="rounded border border-stone-400 bg-white px-4 py-2 hover:bg-stone-50">
            回答の CSV を出力
          </a>
          {results.hasPersonList && (
            <a href={`/admin/forms/${form.id}/csv/roster`} className="rounded border border-stone-400 bg-white px-4 py-2 hover:bg-stone-50">
              名簿の CSV を出力（1 人 1 行）
            </a>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold">回答の一覧（{rows.length} 件）</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-stone-500">まだ回答はありません</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {rows.map((r, i) => (
              <li key={r.id} className="rounded border border-stone-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-stone-500">{i + 1}.</span>
                  <span className="font-bold">{r.respondentName ?? "（名前なし）"}</span>
                  <span className={`rounded px-2 text-sm ${r.kind === "檀家" ? "bg-amber-100" : "bg-sky-100"}`}>{r.kind}</span>
                  {r.householdName && <span>{r.householdName}</span>}
                  <span className="text-base text-stone-600">
                    {r.createdAtLabel}（{SOURCE_LABELS[r.source]}）
                  </span>
                  {r.contact && <span className="text-base text-stone-600">{r.contact}</span>}
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-base sm:grid-cols-[12rem_1fr]">
                  {r.items.map((it) => (
                    <div key={it.label} className="contents">
                      <dt className="text-stone-600">{it.label}</dt>
                      <dd>{it.value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
