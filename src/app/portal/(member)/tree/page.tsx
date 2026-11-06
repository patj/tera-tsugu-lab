// 家系図（窓口、または can_view_household の家族）。ライブラリを使わず、世代ごとの段に並べる
import { getPortalFamilyTree, type TreePersonView } from "@/domain/portal";
import { requirePortal } from "@/lib/portal-auth";
import { Forbidden, PageTitle } from "../../_components/ui";

export const metadata = { title: "家系図 | 檀家ポータル" };

export default async function TreePage() {
  const { actor, ctx } = await requirePortal();
  if (!ctx.can.viewHousehold) return <Forbidden contactName={ctx.contactName} />;
  const tree = await getPortalFamilyTree(actor);

  return (
    <main>
      <PageTitle>{tree.householdName}の家系図</PageTitle>
      <p className="mb-5 text-base text-stone-600">
        上の段ほど前の世代です。「＝」はご夫婦、灰色の枠は故人（法号つき）です。
      </p>
      {tree.generations.length === 0 && <p>家系図に表示できる方が登録されていません。</p>}
      <ol className="space-y-2">
        {tree.generations.map((g, gi) => (
          <li key={g.index}>
            {gi > 0 && <div aria-hidden className="mx-auto mb-2 h-5 w-0.5 bg-stone-400" />}
            <p className="mb-2 text-center text-sm text-stone-500">第 {g.index + 1} 世代</p>
            <div className="flex flex-wrap justify-center gap-3">
              {g.units.map((u) => (
                <div key={u.people[0].id} className="flex items-stretch gap-1 rounded-xl bg-stone-100 p-2">
                  {u.people.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-1">
                      {i > 0 && <span className="px-1 text-xl font-bold text-stone-500" aria-label="夫婦">＝</span>}
                      <PersonBox p={p} self={p.id === tree.selfPersonId} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {tree.others.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xl font-bold">そのほかのご家族</h2>
          <div className="flex flex-wrap gap-3">
            {tree.others.map((p) => (
              <PersonBox key={p.id} p={p} self={p.id === tree.selfPersonId} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function PersonBox({ p, self }: { p: TreePersonView; self: boolean }) {
  return (
    <div
      className={`min-w-28 rounded-lg border-2 px-3 py-2 text-center ${
        p.isDeceased ? "border-stone-300 bg-stone-200 text-stone-700" : self ? "border-amber-500 bg-white" : "border-stone-300 bg-white"
      }`}
    >
      <p className="text-lg font-bold leading-tight">{p.name.split(" ")[1] ?? p.name}</p>
      <p className="text-sm text-stone-600">
        {p.relation ?? ""}
        {p.isContact && <span className="ml-1 rounded bg-sky-100 px-1 text-sky-900">窓口</span>}
        {self && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-900">あなた</span>}
      </p>
      {p.isDeceased && (
        <>
          {p.homyo && <p className="mt-1 text-sm">{p.homyo}</p>}
          {p.deathDate && <p className="text-xs text-stone-600">{Number(p.deathDate.slice(0, 4))} 年 没</p>}
        </>
      )}
      {p.parentNames.length > 0 && <p className="mt-1 text-xs text-stone-500">{p.parentNames.join("・")}の子</p>}
    </div>
  );
}
