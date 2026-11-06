// フォームの一覧と状態の変更、新しいフォーム
import Link from "next/link";
import { jstDateString } from "@/domain/core";
import { FORM_MODES, MODE_LABELS, listForms, type FormStatus } from "@/domain/forms";
import { getStaffActor } from "@/lib/staff-auth";
import { createDraftFormAction, setStatusAction } from "./actions";
import { ErrorBanner, StatusBadge } from "./ui";

export const metadata = { title: "行事・アンケート" };

const NEXT_STATUS: Record<FormStatus, { status: FormStatus; label: string }[]> = {
  draft: [{ status: "open", label: "受付を始める" }],
  open: [{ status: "closed", label: "締め切る" }],
  closed: [{ status: "open", label: "受付を再開する" }],
};

export default async function FormsPage({ searchParams }: PageProps<"/admin/forms">) {
  const { error } = await searchParams;
  const actor = await getStaffActor();
  const forms = await listForms(actor);
  return (
    <div className="text-lg">
      <h1 className="text-2xl font-bold">行事・アンケート</h1>
      <div className="mt-4">
        <ErrorBanner error={error} />
      </div>

      <table className="mt-2 w-full border-collapse bg-white">
        <thead>
          <tr className="border-b border-stone-300 text-left text-base text-stone-600">
            <th className="px-3 py-2">題名</th>
            <th className="px-3 py-2">公開範囲</th>
            <th className="px-3 py-2">状態</th>
            <th className="px-3 py-2 text-right">回答</th>
            <th className="px-3 py-2">作成日</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {forms.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-stone-500">
                フォームはまだありません
              </td>
            </tr>
          )}
          {forms.map((f) => (
            <tr key={f.id} className="border-b border-stone-200 align-middle">
              <td className="px-3 py-3">
                <Link href={`/admin/forms/${f.id}`} className="font-medium underline">
                  {f.title}
                </Link>
              </td>
              <td className="px-3 py-3 text-base">{MODE_LABELS[f.mode]}</td>
              <td className="px-3 py-3">
                <StatusBadge status={f.status} />
              </td>
              <td className="px-3 py-3 text-right">{f.responseCount} 件</td>
              <td className="px-3 py-3 text-base">{jstDateString(f.createdAt)}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  {NEXT_STATUS[f.status].map((n) => (
                    <form key={n.status} action={setStatusAction.bind(null, f.id, n.status, "/admin/forms")}>
                      <button type="submit" className="rounded border border-stone-400 px-3 py-1 text-base hover:bg-stone-100">
                        {n.label}
                      </button>
                    </form>
                  ))}
                  <Link href={`/admin/forms/${f.id}/edit`} className="rounded px-3 py-1 text-base underline">
                    編集
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-10 max-w-xl rounded border border-stone-200 bg-white px-5 py-5">
        <h2 className="text-xl font-bold">新しいフォームを作る</h2>
        <p className="mt-1 text-base text-stone-600">
          下書きで作り、設問を足してから受付を始めます。Claude に「〇〇の申し込みフォームを作って」と頼むこともできます。
        </p>
        <form action={createDraftFormAction} className="mt-4 space-y-4">
          <label className="block">
            <span className="block font-medium">題名</span>
            <input name="title" required className="mt-1 w-full rounded border border-stone-300 px-3 py-2" placeholder="例: 施餓鬼会 参加のご案内" />
          </label>
          <fieldset>
            <legend className="font-medium">公開範囲</legend>
            {FORM_MODES.map((m) => (
              <label key={m} className="mt-1 flex items-center gap-2">
                <input type="radio" name="mode" value={m} defaultChecked={m === "both"} className="size-5" />
                {MODE_LABELS[m]}
              </label>
            ))}
          </fieldset>
          <button type="submit" className="rounded bg-stone-800 px-5 py-2 font-medium text-white">
            下書きを作る
          </button>
        </form>
      </section>
    </div>
  );
}
