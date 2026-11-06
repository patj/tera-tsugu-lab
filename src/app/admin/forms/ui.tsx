// フォームの管理画面で共通に使う部品
import Link from "next/link";
import { STATUS_LABELS, type Form, type FormStatus } from "@/domain/forms";

const STATUS_STYLE: Record<FormStatus, string> = {
  draft: "bg-stone-200 text-stone-800",
  open: "bg-green-100 text-green-900",
  closed: "bg-stone-700 text-white",
};

export function StatusBadge({ status }: { status: FormStatus }) {
  return <span className={`rounded px-2 py-0.5 text-sm font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function ErrorBanner({ error }: { error: string | string[] | undefined }) {
  if (typeof error !== "string" || !error) return null;
  return <p className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">{error}</p>;
}

export function FormTabs({ form, current }: { form: Pick<Form, "id" | "mode">; current: "results" | "edit" | "links" }) {
  const tabs = [
    { key: "results", href: `/admin/forms/${form.id}`, label: "集計と回答" },
    { key: "edit", href: `/admin/forms/${form.id}/edit`, label: "フォームの編集" },
    ...(form.mode === "public" ? [] : [{ key: "links", href: `/admin/forms/${form.id}/links`, label: "個別リンク" }]),
  ];
  return (
    <nav className="mt-4 flex flex-wrap gap-2 border-b border-stone-200 print:hidden">
      <Link href="/admin/forms" className="px-3 py-2 text-stone-600 hover:underline">
        ← 一覧
      </Link>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-t px-4 py-2 ${t.key === current ? "border border-b-0 border-stone-200 bg-white font-bold" : "hover:underline"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
