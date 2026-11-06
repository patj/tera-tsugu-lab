// 公開フォーム（ログインなし。スマートフォン向け）。共通リンクは全項目、個別リンク（?t=<トークン>）は簡易版
import { notFound } from "next/navigation";
import { findFormRow, getFormForRespondent, resolveHouseholdToken } from "@/domain/forms";
import { RespondForm } from "./respond-form";

export const metadata = { title: "申し込み・アンケート" };

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-10">
      <h1 className="text-2xl font-bold leading-snug">{title}</h1>
      <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-lg">{message}</p>
    </main>
  );
}

export default async function PublicFormPage({ params, searchParams }: PageProps<"/f/[formId]">) {
  const { formId } = await params;
  const { t } = await searchParams;
  const token = typeof t === "string" && t ? t : null;

  const row = await findFormRow(formId);
  if (!row || row.status === "draft") notFound();

  // 一般向けのフォームは、トークンがついていても共通リンクとして扱う
  let householdId: string | null = null;
  if (token && row.mode !== "public") {
    householdId = await resolveHouseholdToken(row.id, token);
    if (!householdId) {
      return <Notice title={row.title} message="このリンクは使えません。お手元の案内のリンクをもう一度お確かめいただくか、お寺にお問い合わせください。" />;
    }
  }

  const view = await getFormForRespondent(row.id, { source: householdId ? "member_link" : "public", householdId });
  if (!view) notFound();
  if (view.availability !== "ok") return <Notice title={view.title} message={view.notice ?? ""} />;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-8 text-lg">
      <h1 className="text-2xl font-bold leading-snug">{view.title}</h1>
      {view.household && (
        <p className="mt-3 rounded-lg bg-stone-100 px-4 py-3">
          {view.household.name}の皆さま専用のページです。ご住所やお名前など、お寺でわかっている項目は入力いただかなくて大丈夫です。
        </p>
      )}
      {view.description && <p className="mt-4 whitespace-pre-wrap text-stone-700">{view.description}</p>}
      <RespondForm form={view} token={householdId ? token : null} />
    </main>
  );
}
