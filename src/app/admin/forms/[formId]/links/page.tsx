// 世帯ごとの個別リンクの一覧（印刷用）
import { notFound } from "next/navigation";
import { isDomainError } from "@/domain/core";
import { getForm, listHouseholdLinks } from "@/domain/forms";
import { getStaffActor } from "@/lib/staff-auth";
import { issueTokensAction } from "../../actions";
import { ErrorBanner, FormTabs, StatusBadge } from "../../ui";

export default async function FormLinksPage({ params, searchParams }: PageProps<"/admin/forms/[formId]/links">) {
  const { formId } = await params;
  const { error, issued } = await searchParams;
  const actor = await getStaffActor();
  let form;
  try {
    form = await getForm(actor, formId);
  } catch (e) {
    if (isDomainError(e) && e.code === "not_found") notFound();
    throw e;
  }
  const links = form.mode === "public" ? [] : await listHouseholdLinks(actor, form.id);
  const missing = links.filter((l) => !l.token).length;

  return (
    <div className="text-lg">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{form.title}</h1>
        <StatusBadge status={form.status} />
      </div>
      <FormTabs form={form} current="links" />

      <div className="mt-6 print:hidden">
        <ErrorBanner error={error} />
        {typeof issued === "string" && <p className="mb-4 rounded bg-green-50 px-4 py-3">{issued} 世帯に個別リンクを発行しました。</p>}
        {form.mode === "public" ? (
          <p>一般向け（共通リンクだけ）のフォームなので、個別リンクはありません。</p>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-base text-stone-600">
              檀家の世帯ごとのリンクです。寺報や案内状に印刷してお届けください。このリンクから回答すると、台帳でわかる項目は聞かれず、回答が世帯にひもづきます。
            </p>
            {missing > 0 && (
              <form action={issueTokensAction.bind(null, form.id)}>
                <button type="submit" className="rounded bg-stone-800 px-4 py-2 font-medium text-white">
                  まだ発行していない {missing} 世帯に発行する
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {links.length > 0 && (
        <table className="mt-6 w-full border-collapse bg-white">
          <thead>
            <tr className="border-b border-stone-300 text-left text-base text-stone-600">
              <th className="px-3 py-2">世帯</th>
              <th className="px-3 py-2">住所</th>
              <th className="px-3 py-2">個別リンク</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.householdId} className="break-inside-avoid border-b border-stone-200 align-top">
                <td className="whitespace-nowrap px-3 py-3 font-medium">{l.householdName}</td>
                <td className="px-3 py-3 text-base">{l.address}</td>
                <td className="px-3 py-3 font-mono text-base break-all">
                  {l.url ? (
                    <a href={`/f/${form.id}?t=${encodeURIComponent(l.token ?? "")}`} target="_blank" rel="noreferrer" className="underline">
                      {l.url}
                    </a>
                  ) : (
                    <span className="text-stone-500">未発行</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {form.mode !== "public" && links.length === 0 && <p className="mt-6 text-stone-500">檀家の世帯が台帳にありません。</p>}
    </div>
  );
}
