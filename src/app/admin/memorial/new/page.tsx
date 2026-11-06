// 電話で受けた法要の登録: 故人を選ぶ → 検証 → 候補 → 確定（GET の条件で段階を進める）
import Link from "next/link";
import { addDays, parseDateString, todayJst } from "@/domain/core";
import { searchDeceased } from "@/domain/ledger";
import { isMemorialLocation, JOINT_SERVICE_LABEL, LOCATION_LABELS, verifyMemorial, type MemorialLocation } from "@/domain/memorial";
import { getStaffActor } from "@/lib/staff-auth";
import { BookingSection, intParam } from "../booking-section";
import { input, MemorialTabs, VerifyResultView } from "../ui";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");
const many = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []).flatMap((s) => s.split(",")).filter(Boolean);
function validDate(s: string): string | null {
  try {
    parseDateString(s);
    return s;
  } catch {
    return null;
  }
}
function monthEnd(date: string): string {
  const { year, month } = parseDateString(date);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}

export default async function NewMemorialPage({ searchParams }: PageProps<"/admin/memorial/new">) {
  const actor = await getStaffActor();
  const sp = await searchParams;
  const q = one(sp.q);
  const personId = one(sp.person);
  const today = todayJst();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">電話で受けた法要を登録する</h1>
        <MemorialTabs />
      </div>
      <ol className="flex flex-wrap gap-2 text-sm text-stone-600">
        {["1. 故人を選ぶ", "2. 検証", "3. 候補の日時", "4. 確定"].map((s) => (
          <li key={s} className="rounded bg-stone-100 px-2 py-1">
            {s}
          </li>
        ))}
      </ol>
      {personId ? <Step2 actor={actor} sp={sp} personId={personId} today={today} /> : <Step1 actor={actor} q={q} today={today} />}
    </div>
  );
}

async function Step1({ actor, q, today }: { actor: Awaited<ReturnType<typeof getStaffActor>>; q: string; today: string }) {
  const list = q ? await searchDeceased(actor, { query: q, limit: 50, today }) : [];
  return (
    <section className="space-y-4 rounded border border-stone-200 bg-white p-4">
      <h2 className="text-lg font-bold">1. 故人を選ぶ</h2>
      <form className="flex flex-wrap items-end gap-3">
        <label className="block flex-1">
          <span className="text-sm text-stone-600">俗名・法号の一部（例: 山田、慈光院）</span>
          <input name="q" defaultValue={q} required className={input} />
        </label>
        <button type="submit" className="rounded border border-stone-400 bg-white px-4 py-2 hover:bg-stone-50">
          探す
        </button>
      </form>
      {q && list.length === 0 && <p className="text-stone-600">当てはまる故人が見つかりません。</p>}
      {list.length > 1 && <p className="text-amber-800">候補が {list.length} 人います。法号・没年・世帯（住所）で、どの方かを確かめてください。</p>}
      {list.length > 0 && (
        <table className="w-full text-left">
          <thead className="border-b border-stone-200 text-sm text-stone-600">
            <tr>
              <th className="px-2 py-1">法号</th>
              <th className="px-2 py-1">俗名</th>
              <th className="px-2 py-1">没年月日</th>
              <th className="px-2 py-1">世帯</th>
              <th className="px-2 py-1">次の年忌</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.personId} className="border-b border-stone-100 last:border-0">
                <td className="px-2 py-1.5">{c.homyo ?? "—"}</td>
                <td className="px-2 py-1.5">
                  {c.name}
                  {c.relation && <span className="text-stone-600">（{c.relation}）</span>}
                </td>
                <td className="px-2 py-1.5">{c.deathDate}</td>
                <td className="px-2 py-1.5">
                  {c.household.name}
                  <div className="text-sm text-stone-600">{c.household.address}</div>
                </td>
                <td className="px-2 py-1.5">{c.nextMemorial ? `${c.nextMemorial.year} 年 ${c.nextMemorial.kaikiName}` : "—"}</td>
                <td className="px-2 py-1.5">
                  <Link href={`/admin/memorial/new?person=${c.personId}`} className="rounded bg-stone-800 px-3 py-1.5 text-white hover:bg-stone-700">
                    この方で進む
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

async function Step2({
  actor,
  sp,
  personId,
  today,
}: {
  actor: Awaited<ReturnType<typeof getStaffActor>>;
  sp: Record<string, string | string[] | undefined>;
  personId: string;
  today: string;
}) {
  const kaikiParam = intParam(sp.kaiki);
  let from = validDate(one(sp.from));
  let to = validDate(one(sp.to));
  const locationParam = one(sp.location);
  const location: MemorialLocation = isMemorialLocation(locationParam) ? locationParam : "temple";
  const withIds = many(sp.with);
  const searched = Boolean(from && to);

  // 期間がなければ、次の年忌の祥月命日の月を初期値にする
  const base = await verifyMemorial(actor, { personId, kaiki: kaikiParam || null, today });
  if (base.status !== "verified") return <p className="text-stone-600">{base.message}</p>;
  if (!from || !to) {
    const monthStart = `${base.meinichi.slice(0, 7)}-01`;
    from = monthStart < today ? today : monthStart;
    to = monthEnd(base.meinichi);
  }
  if (from > to) to = from;
  const result = await verifyMemorial(actor, { personId, kaiki: kaikiParam || base.kaiki, period: { from, to }, today });
  if (result.status !== "verified") return <p className="text-stone-600">{result.message}</p>;
  const joint = result.checks.joint.candidates;
  const chosenJoint = joint.filter((j) => withIds.includes(j.personId));

  const keep: Record<string, string> = { person: personId, from, to, location, kaiki: String(result.checks.kaiki.requested ?? result.kaiki) };
  const hidden = [
    { name: "householdId", value: result.person.household.id },
    { name: "target", value: `${personId}:${result.checks.kaiki.requested ?? result.kaiki}` },
    ...chosenJoint.map((j) => ({ name: "target", value: `${j.personId}:${j.kaiki}` })),
  ];

  return (
    <>
      <section className="space-y-3 rounded border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">
            2. 検証: {result.person.household.name} {result.person.name}（{result.person.homyo ?? "法号なし"}）
          </h2>
          <Link href="/admin/memorial/new" className="text-sm underline">
            故人を選び直す
          </Link>
        </div>
        <form className="space-y-3">
          <input type="hidden" name="person" value={personId} />
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-sm text-stone-600">依頼の回忌（一周忌は 2）</span>
              <input type="number" name="kaiki" min={1} max={100} defaultValue={result.checks.kaiki.requested ?? result.kaiki} className={input} />
            </label>
            <label className="block">
              <span className="text-sm text-stone-600">希望の時期（から）</span>
              <input type="date" name="from" defaultValue={from} required className={input} />
            </label>
            <label className="block">
              <span className="text-sm text-stone-600">希望の時期（まで）</span>
              <input type="date" name="to" defaultValue={to} required className={input} />
            </label>
            <label className="block">
              <span className="text-sm text-stone-600">場所</span>
              <select name="location" defaultValue={location} className={input}>
                {Object.entries(LOCATION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {joint.length > 0 && (
            <fieldset className="rounded border border-violet-300 bg-violet-50 p-3">
              <legend className="px-1 font-medium text-violet-900">{JOINT_SERVICE_LABEL}（あわせて営む故人を選ぶ）</legend>
              {joint.map((j) => (
                <label key={j.personId} className="flex items-center gap-2">
                  <input type="checkbox" name="with" value={j.personId} defaultChecked={withIds.includes(j.personId)} />
                  {j.relation} {j.name}（{j.homyo ?? "法号なし"}）{j.kaikiName}・祥月命日 {j.meinichi}
                </label>
              ))}
            </fieldset>
          )}
          <button type="submit" className="rounded border border-stone-400 bg-white px-4 py-2 hover:bg-stone-50">
            {searched ? "条件を変えて確かめ直す" : "この条件で候補を出す"}
          </button>
        </form>
        <VerifyResultView result={result} />
      </section>

      {searched && (
        <section className="space-y-3 rounded border border-stone-200 bg-white p-4">
          <h2 className="text-lg font-bold">
            3. 候補の日時（{LOCATION_LABELS[location]}
            {chosenJoint.length > 0 ? `、${JOINT_SERVICE_LABEL}: ${[result.person.name, ...chosenJoint.map((j) => j.name)].join("・")}` : ""}）
          </h2>
          <BookingSection
            actor={actor}
            householdId={result.person.household.id}
            periods={[{ from, to }]}
            location={location}
            targetPersonIds={[personId, ...chosenJoint.map((j) => j.personId)]}
            travelBefore={intParam(sp.travelBefore)}
            travelAfter={intParam(sp.travelAfter)}
            hidden={hidden}
            keep={{ ...keep, ...(chosenJoint.length > 0 ? { with: chosenJoint.map((j) => j.personId).join(",") } : {}) }}
          />
        </section>
      )}
    </>
  );
}
