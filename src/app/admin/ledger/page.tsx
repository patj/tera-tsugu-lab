// 世帯の一覧と検索（名前、住所、電話）。状態で絞り込む
import Link from "next/link";
import { HOUSEHOLD_STATUS_LABELS, HOUSEHOLD_STATUSES, searchHouseholds, type HouseholdStatus } from "@/domain/ledger";
import { getStaffActor } from "@/lib/staff-auth";
import { Badge, buttonClass, inputClass, linkClass, Notice, param, subButtonClass } from "./ui";

export default async function LedgerPage({ searchParams }: PageProps<"/admin/ledger">) {
  const sp = await searchParams;
  const q = param(sp.q) ?? "";
  const statusParam = param(sp.status) ?? "active";
  const status = HOUSEHOLD_STATUSES.includes(statusParam as HouseholdStatus) ? (statusParam as HouseholdStatus) : undefined;
  const actor = await getStaffActor();
  const list = await searchHouseholds(actor, q, { status });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">世帯の一覧</h1>
        <Link href="/admin/ledger/households/new" className={buttonClass}>
          世帯を追加する
        </Link>
      </div>
      <div className="mt-4">
        <Notice error={param(sp.error)} done={param(sp.done)} />
      </div>

      <form className="mt-2 flex flex-wrap items-end gap-3" action="/admin/ledger">
        <label className="min-w-64 flex-1">
          <span className="block font-medium">名前・住所・電話</span>
          <input name="q" defaultValue={q} placeholder="例: 田中、本町、0422-55" className={inputClass} />
        </label>
        <label>
          <span className="block font-medium">状態</span>
          <select name="status" defaultValue={status ?? "all"} className={inputClass}>
            {HOUSEHOLD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {HOUSEHOLD_STATUS_LABELS[s]}
              </option>
            ))}
            <option value="all">すべて</option>
          </select>
        </label>
        <button type="submit" className={subButtonClass}>
          検索
        </button>
      </form>

      <p className="mt-4 text-stone-600">{list.length} 世帯</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse bg-white">
          <thead>
            <tr className="border-b border-stone-300 text-left">
              <th className="px-3 py-2">世帯</th>
              <th className="px-3 py-2">世帯主</th>
              <th className="px-3 py-2">窓口</th>
              <th className="px-3 py-2">住所</th>
              <th className="px-3 py-2">電話</th>
              <th className="px-3 py-2">状態</th>
            </tr>
          </thead>
          <tbody>
            {list.map((h) => (
              <tr key={h.id} className="border-b border-stone-200">
                <td className="px-3 py-2">
                  <Link href={`/admin/ledger/households/${h.id}`} className={`${linkClass} font-medium`}>
                    {h.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{h.head?.name}</td>
                <td className="px-3 py-2">{h.contact?.name}</td>
                <td className="px-3 py-2">{h.address}</td>
                <td className="px-3 py-2 whitespace-nowrap">{h.phone}</td>
                <td className="px-3 py-2">
                  <Badge tone={h.status === "active" ? "stone" : "amber"}>{h.statusLabel}</Badge>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-stone-500">
                  見つかりませんでした
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
