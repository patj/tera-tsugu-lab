// 世帯の編集。世帯主と窓口の変更
import { setHouseholdRolesAction, updateHouseholdAction } from "../../../actions";
import { HouseholdFields } from "../../../household-fields";
import { loadHousehold } from "../../../load";
import { BackLink, buttonClass, Field, inputClass, Notice, param, Section } from "../../../ui";

export default async function EditHouseholdPage({ params, searchParams }: PageProps<"/admin/ledger/households/[id]/edit">) {
  const { id } = await params;
  const sp = await searchParams;
  const h = await loadHousehold(id, 0);
  const back = `/admin/ledger/households/${id}/edit`;

  return (
    <div className="max-w-3xl">
      <BackLink href={`/admin/ledger/households/${id}`}>{h.name}</BackLink>
      <h1 className="mt-2 text-2xl font-bold">{h.name}を編集する</h1>
      <div className="mt-4">
        <Notice error={param(sp.error)} done={param(sp.done)} />
      </div>

      <Section title="世帯主と窓口">
        <p className="mb-3 text-stone-600">
          窓口は、家を代表してお寺とやりとりする人です（檀家ポータルで家を代表する権限を持ちます）。世帯主と別の人にできます。
        </p>
        <form action={setHouseholdRolesAction} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="householdId" value={h.id} />
          <input type="hidden" name="back" value={back} />
          <Field label="世帯主">
            <select name="headPersonId" defaultValue={h.head?.id ?? ""} className={inputClass}>
              <option value="">（未設定）</option>
              {h.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{m.relation}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="窓口">
            <select name="contactPersonId" defaultValue={h.contact?.id ?? ""} className={inputClass}>
              <option value="">（未設定）</option>
              {h.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{m.relation}）
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className={buttonClass}>
            保存する
          </button>
        </form>
      </Section>

      <Section title="世帯の情報">
        <form action={updateHouseholdAction} className="space-y-6">
          <input type="hidden" name="householdId" value={h.id} />
          <HouseholdFields household={h} />
          <button type="submit" className={buttonClass}>
            保存する
          </button>
        </form>
      </Section>
    </div>
  );
}
