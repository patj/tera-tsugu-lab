// 世帯の詳細: 家族（世帯主と窓口の印）、故人（法号、俗名、没年月日、享年、次の年忌）、対応記録
import Link from "next/link";
import { formatJst, getTemple } from "@/domain/core";
import { CONTACT_LOG_KINDS } from "@/domain/ledger";
import { getStaffActor } from "@/lib/staff-auth";
import { addContactLogAction } from "../../actions";
import { loadHousehold } from "../../load";
import { Badge, BackLink, buttonClass, genderLabel, inputClass, linkClass, Notice, param, Section, subButtonClass } from "../../ui";

export default async function HouseholdPage({ params, searchParams }: PageProps<"/admin/ledger/households/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const h = await loadHousehold(id);
  const actor = await getStaffActor();
  const preset = (await getTemple(actor.templeId)).preset;

  return (
    <div>
      <BackLink href="/admin/ledger">世帯の一覧</BackLink>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{h.name}</h1>
        <Badge tone={h.status === "active" ? "stone" : "amber"}>{h.statusLabel}</Badge>
        <Link href={`/admin/ledger/households/${h.id}/edit`} className={`${subButtonClass} ml-auto`}>
          世帯を編集する
        </Link>
      </div>
      <div className="mt-4">
        <Notice error={param(sp.error)} done={param(sp.done)} />
      </div>

      <dl className="grid gap-x-6 gap-y-1 rounded border border-stone-200 bg-white p-4 sm:grid-cols-[8rem_1fr]">
        <dt className="text-stone-500">住所</dt>
        <dd>
          {h.postalCode && `〒${h.postalCode} `}
          {h.address}
        </dd>
        <dt className="text-stone-500">固定電話</dt>
        <dd>{h.phone}</dd>
        <dt className="text-stone-500">お墓の場所</dt>
        <dd>{h.graveAddress ?? "境内の墓地（または未登録）"}</dd>
        <dt className="text-stone-500">世帯主</dt>
        <dd>{h.head?.name ?? "（未設定）"}</dd>
        <dt className="text-stone-500">窓口</dt>
        <dd>{h.contact?.name ?? "（未設定）"}</dd>
        <dt className="text-stone-500">入檀日</dt>
        <dd>{h.joinedOn}</dd>
        {h.notes && (
          <>
            <dt className="text-stone-500">備考</dt>
            <dd className="whitespace-pre-wrap">{h.notes}</dd>
          </>
        )}
      </dl>

      <Section
        title={`家族（${h.members.length} 人）`}
        action={
          <Link href={`/admin/ledger/households/${h.id}/persons/new`} className={subButtonClass}>
            家族を追加する
          </Link>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr className="border-b border-stone-300 text-left">
                <th className="px-3 py-2">氏名</th>
                <th className="px-3 py-2">続柄</th>
                <th className="px-3 py-2">性別</th>
                <th className="px-3 py-2">生年月日</th>
                <th className="px-3 py-2">携帯・メール</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {h.members.map((m) => (
                <tr key={m.id} className="border-b border-stone-200">
                  <td className="px-3 py-2">
                    <div className="font-medium">{m.name}</div>
                    <div className="text-sm text-stone-500">{m.kana}</div>
                    <div className="mt-1 flex gap-1">
                      {m.isHead && <Badge tone="blue">世帯主</Badge>}
                      {m.isContact && <Badge tone="amber">窓口</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2">{m.relation}</td>
                  <td className="px-3 py-2">{genderLabel(m.gender)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{m.birthDate}</td>
                  <td className="px-3 py-2 text-sm">
                    <div>{m.mobilePhone}</div>
                    <div>{m.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/ledger/persons/${m.id}/edit`} className={linkClass}>
                      編集
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title={`故人（${h.deceased.length} 人）`}
        action={
          <Link href={`/admin/ledger/households/${h.id}/persons/new?deceased=1`} className={subButtonClass}>
            故人を追加する
          </Link>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr className="border-b border-stone-300 text-left">
                <th className="px-3 py-2">{preset.posthumousNameLabel}</th>
                <th className="px-3 py-2">俗名</th>
                <th className="px-3 py-2">続柄</th>
                <th className="px-3 py-2">没年月日</th>
                <th className="px-3 py-2">享年</th>
                <th className="px-3 py-2">次の年忌</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {h.deceased.map((d) => (
                <tr key={d.id} className="border-b border-stone-200">
                  <td className="px-3 py-2 font-medium">{d.homyo}</td>
                  <td className="px-3 py-2">{d.name}</td>
                  <td className="px-3 py-2">{d.relation}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{d.deathDate}</td>
                  <td className="px-3 py-2">{d.ageAtDeath ?? ""}</td>
                  <td className="px-3 py-2">
                    {d.nextMemorial
                      ? `${d.nextMemorial.year} 年 ${d.nextMemorial.kaikiName}（祥月命日 ${d.nextMemorial.meinichi.slice(5).replace("-", "/")}）`
                      : "―"}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/ledger/persons/${d.id}/edit`} className={linkClass}>
                      編集
                    </Link>
                  </td>
                </tr>
              ))}
              {h.deceased.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-stone-500">
                    故人はいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="対応記録">
        <form action={addContactLogAction} className="mb-4 grid gap-3 rounded border border-stone-200 bg-white p-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <input type="hidden" name="householdId" value={h.id} />
          <label>
            <span className="block font-medium">種類</span>
            <select name="kind" className={inputClass}>
              {CONTACT_LOG_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="block font-medium">内容</span>
            <input name="body" required placeholder="例: 三回忌のご案内をした" className={inputClass} />
          </label>
          <button type="submit" className={buttonClass}>
            追加する
          </button>
        </form>
        <ul className="space-y-2">
          {h.contactLogs.map((l) => (
            <li key={l.id} className="rounded border border-stone-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
                <Badge>{l.kind}</Badge>
                <span>{formatJst(l.createdAt)}</span>
                {l.staffName && <span>記録者: {l.staffName}</span>}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{l.body}</p>
            </li>
          ))}
          {h.contactLogs.length === 0 && <li className="text-stone-500">対応記録はまだありません</li>}
        </ul>
      </Section>
    </div>
  );
}
