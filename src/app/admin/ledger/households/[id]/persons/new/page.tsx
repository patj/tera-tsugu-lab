// 家族・故人の追加
import { getTemple } from "@/domain/core";
import { getStaffActor } from "@/lib/staff-auth";
import { createPersonAction } from "../../../../actions";
import { loadHousehold } from "../../../../load";
import { BackLink, buttonClass, Notice, param, PersonFields } from "../../../../ui";

export default async function NewPersonPage({ params, searchParams }: PageProps<"/admin/ledger/households/[id]/persons/new">) {
  const { id } = await params;
  const sp = await searchParams;
  const h = await loadHousehold(id, 0);
  const deceased = param(sp.deceased) === "1";
  const preset = (await getTemple((await getStaffActor()).templeId)).preset;
  const back = `/admin/ledger/households/${id}/persons/new${deceased ? "?deceased=1" : ""}`;

  return (
    <div className="max-w-3xl">
      <BackLink href={`/admin/ledger/households/${id}`}>{h.name}</BackLink>
      <h1 className="mt-2 text-2xl font-bold">
        {h.name}に{deceased ? "故人" : "家族"}を追加する
      </h1>
      <div className="mt-4">
        <Notice error={param(sp.error)} />
      </div>
      <form action={createPersonAction} className="mt-4 space-y-6">
        <input type="hidden" name="householdId" value={h.id} />
        <input type="hidden" name="back" value={back} />
        <PersonFields
          person={{ familyName: h.name.replace(/家$/, "") }}
          homyoLabel={preset.posthumousNameLabel}
          deceasedDefault={deceased}
        />
        <button type="submit" className={buttonClass}>
          登録する
        </button>
      </form>
    </div>
  );
}
