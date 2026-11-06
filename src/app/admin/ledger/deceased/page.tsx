// 故人の一覧（過去帳）
import Link from "next/link";
import { getTemple } from "@/domain/core";
import { searchDeceased } from "@/domain/ledger";
import { getStaffActor } from "@/lib/staff-auth";
import { Badge, inputClass, linkClass, param, subButtonClass } from "../ui";

export default async function DeceasedPage({ searchParams }: PageProps<"/admin/ledger/deceased">) {
  const sp = await searchParams;
  const q = param(sp.q) ?? "";
  const actor = await getStaffActor();
  const preset = (await getTemple(actor.templeId)).preset;
  const list = await searchDeceased(actor, { query: q, limit: 500 });

  return (
    <div>
      <h1 className="text-2xl font-bold">過去帳</h1>
      <form className="mt-4 flex flex-wrap items-end gap-3" action="/admin/ledger/deceased">
        <label className="min-w-64 flex-1">
          <span className="block font-medium">俗名・{preset.posthumousNameLabel}</span>
          <input name="q" defaultValue={q} placeholder="例: 山田、慈光院" className={inputClass} />
        </label>
        <button type="submit" className={subButtonClass}>
          検索
        </button>
      </form>
      <p className="mt-4 text-stone-600">{list.length} 人（没年月日の新しい順）</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse bg-white">
          <thead>
            <tr className="border-b border-stone-300 text-left">
              <th className="px-3 py-2">{preset.posthumousNameLabel}</th>
              <th className="px-3 py-2">俗名</th>
              <th className="px-3 py-2">没年月日</th>
              <th className="px-3 py-2">享年</th>
              <th className="px-3 py-2">続柄</th>
              <th className="px-3 py-2">世帯</th>
              <th className="px-3 py-2">次の年忌</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.personId} className="border-b border-stone-200">
                <td className="px-3 py-2 font-medium">
                  <Link href={`/admin/ledger/persons/${d.personId}/edit`} className={linkClass}>
                    {d.homyo ?? "（未設定）"}
                  </Link>
                </td>
                <td className="px-3 py-2">{d.name}</td>
                <td className="px-3 py-2 whitespace-nowrap">{d.deathDate}</td>
                <td className="px-3 py-2">{d.ageAtDeath ?? ""}</td>
                <td className="px-3 py-2">{d.relation}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/ledger/households/${d.household.id}`} className={linkClass}>
                    {d.household.name}
                  </Link>
                  {d.household.status !== "active" && (
                    <span className="ml-1">
                      <Badge tone="amber">{d.household.statusLabel}</Badge>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{d.nextMemorial ? `${d.nextMemorial.year} 年 ${d.nextMemorial.kaikiName}` : "―"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
