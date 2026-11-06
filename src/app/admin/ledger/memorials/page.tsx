// 年忌を迎える故人の一覧（期間を指定する。初期値は来月）
import Link from "next/link";
import { getTemple, isDomainError, jstParts } from "@/domain/core";
import { listUpcomingMemorials, type UpcomingMemorials } from "@/domain/ledger";
import { getStaffActor } from "@/lib/staff-auth";
import { inputClass, linkClass, Notice, param, subButtonClass } from "../ui";

const pad = (n: number) => String(n).padStart(2, "0");

/** 来月の 1 日と末日 */
function nextMonth(now: Date): { from: string; to: string } {
  const { year, month } = jstParts(now);
  const y = month === 12 ? year + 1 : year;
  const m = month === 12 ? 1 : month + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

export default async function MemorialsPage({ searchParams }: PageProps<"/admin/ledger/memorials">) {
  const sp = await searchParams;
  const def = nextMonth(new Date());
  const from = param(sp.from) || def.from;
  const to = param(sp.to) || def.to;
  const actor = await getStaffActor();
  const preset = (await getTemple(actor.templeId)).preset;

  let result: UpcomingMemorials | null = null;
  let error: string | undefined;
  try {
    result = await listUpcomingMemorials(actor, { from, to });
  } catch (e) {
    if (!isDomainError(e)) throw e;
    error = e.message;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">年忌を迎える故人</h1>
      <p className="mt-1 text-stone-600">
        その年の祥月命日が期間に入る故人を、回忌ごとに並べます（離檀・転出の世帯は除きます）。
      </p>
      <form className="mt-4 flex flex-wrap items-end gap-3" action="/admin/ledger/memorials">
        <label>
          <span className="block font-medium">期間の始まり</span>
          <input type="date" name="from" defaultValue={from} className={inputClass} />
        </label>
        <label>
          <span className="block font-medium">終わり</span>
          <input type="date" name="to" defaultValue={to} className={inputClass} />
        </label>
        <button type="submit" className={subButtonClass}>
          表示
        </button>
        <Link href="/admin/ledger/memorials" className={linkClass}>
          来月
        </Link>
      </form>

      <div className="mt-4">
        <Notice error={error} />
      </div>

      {result && (
        <>
          <p className="mt-2 text-stone-600">
            {result.from}〜{result.to}: {result.total} 人
          </p>
          {result.groups.map((g) => (
            <section key={g.kaiki} className="mt-6">
              <h2 className="border-b border-stone-200 pb-1 text-xl font-bold">
                {g.kaikiName}（{g.count} 人）
              </h2>
              <ul className="mt-2 space-y-2">
                {g.items.map((i) => (
                  <li key={`${i.personId}-${i.meinichi}`} className="rounded border border-stone-200 bg-white px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="font-medium">{i.meinichi.replaceAll("-", "/")}</span>
                      <Link href={`/admin/ledger/households/${i.household.id}`} className={`${linkClass} font-medium`}>
                        {i.household.name}
                      </Link>
                      <span>
                        {i.homyo}（俗名 {i.name}
                        {i.relation && `・${i.relation}`}）
                      </span>
                      <span className="text-sm text-stone-600">没 {i.deathDate}</span>
                    </div>
                    <div className="mt-1 text-sm text-stone-600">
                      窓口: {i.household.contactPersonName ?? "未設定"} ／ 電話: {i.household.phone ?? "なし"}
                    </div>
                    {i.sameYearInHousehold.length > 0 && (
                      <div className="mt-1 text-sm text-amber-800">
                        {preset.jointServiceLabel}の候補（同じ年に年忌）:{" "}
                        {i.sameYearInHousehold.map((o) => `${o.name} ${o.kaikiName}（${o.meinichi.slice(5).replace("-", "/")}）`).join("、")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {result.total === 0 && <p className="mt-6 text-stone-500">この期間に年忌を迎える故人はいません</p>}
        </>
      )}
    </div>
  );
}
