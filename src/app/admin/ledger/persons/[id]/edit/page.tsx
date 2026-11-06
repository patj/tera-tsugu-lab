// 個人の編集と、関係（親子、配偶者）の編集
import { getTemple } from "@/domain/core";
import { getHouseholdMembers, searchDeceased } from "@/domain/ledger";
import { getStaffActor } from "@/lib/staff-auth";
import { addRelationAction, removeRelationAction, updatePersonAction } from "../../../actions";
import { loadPerson } from "../../../load";
import { Badge, BackLink, buttonClass, Field, inputClass, Notice, param, PersonFields, Section, subButtonClass } from "../../../ui";

export default async function EditPersonPage({ params, searchParams }: PageProps<"/admin/ledger/persons/[id]/edit">) {
  const { id } = await params;
  const sp = await searchParams;
  const p = await loadPerson(id);
  const actor = await getStaffActor();
  const preset = (await getTemple(actor.templeId)).preset;

  // 関係の相手の候補: 同じ世帯の人（生きている家族と故人）
  const living = await getHouseholdMembers(p.householdId);
  const dead = await searchDeceased(actor, { householdId: p.householdId });
  const candidates = [
    ...living.map((m) => ({ id: m.id, label: `${m.name}（${m.relation ?? ""}）` })),
    ...dead.map((d) => ({ id: d.personId, label: `${d.name}（${d.relation ?? ""}・故人）` })),
  ].filter((c) => c.id !== p.id && !p.relations.some((r) => r.other.id === c.id));

  return (
    <div className="max-w-3xl">
      <BackLink href={`/admin/ledger/households/${p.householdId}`}>{p.householdName}</BackLink>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{p.name}</h1>
        {p.isDeceased && <Badge>故人</Badge>}
        {p.isHead && <Badge tone="blue">世帯主</Badge>}
        {p.isContact && <Badge tone="amber">窓口</Badge>}
      </div>
      <div className="mt-4">
        <Notice error={param(sp.error)} done={param(sp.done)} />
      </div>

      <form action={updatePersonAction} className="mt-4 space-y-6">
        <input type="hidden" name="personId" value={p.id} />
        <input type="hidden" name="householdId" value={p.householdId} />
        <PersonFields person={p} homyoLabel={preset.posthumousNameLabel} />
        <button type="submit" className={buttonClass}>
          保存する
        </button>
      </form>

      <Section title="関係（家系図）">
        <ul className="space-y-2">
          {p.relations.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded border border-stone-200 bg-white px-4 py-2">
              <Badge>{r.roleLabel}</Badge>
              <span className="flex-1">
                {r.other.name}
                {r.other.isDeceased && "（故人）"}
              </span>
              <form action={removeRelationAction}>
                <input type="hidden" name="personId" value={p.id} />
                <input type="hidden" name="relationId" value={r.id} />
                <button type="submit" className="text-red-700 underline">
                  外す
                </button>
              </form>
            </li>
          ))}
          {p.relations.length === 0 && <li className="text-stone-500">関係はまだ登録されていません</li>}
        </ul>

        {candidates.length > 0 && (
          <form action={addRelationAction} className="mt-4 grid gap-3 rounded border border-stone-200 bg-white p-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <input type="hidden" name="personId" value={p.id} />
            <Field label="相手">
              <select name="otherPersonId" className={inputClass}>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`相手は ${p.givenName} さんの`}>
              <select name="role" className={inputClass}>
                <option value="parent">親</option>
                <option value="child">子</option>
                <option value="spouse">配偶者</option>
              </select>
            </Field>
            <button type="submit" className={subButtonClass}>
              追加する
            </button>
          </form>
        )}
      </Section>
    </div>
  );
}
