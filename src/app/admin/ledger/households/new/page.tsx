import { createHouseholdAction } from "../../actions";
import { HouseholdFields } from "../../household-fields";
import { BackLink, buttonClass, Notice, param } from "../../ui";

export default async function NewHouseholdPage({ searchParams }: PageProps<"/admin/ledger/households/new">) {
  const sp = await searchParams;
  return (
    <div className="max-w-3xl">
      <BackLink href="/admin/ledger">世帯の一覧</BackLink>
      <h1 className="mt-2 text-2xl font-bold">世帯を追加する</h1>
      <p className="mt-1 text-stone-600">世帯を作ったあとで、家族と故人を登録します。最初に登録した家族が、世帯主と窓口になります。</p>
      <div className="mt-4">
        <Notice error={param(sp.error)} />
      </div>
      <form action={createHouseholdAction} className="mt-4 space-y-6">
        <HouseholdFields />
        <button type="submit" className={buttonClass}>
          作る
        </button>
      </form>
    </div>
  );
}
