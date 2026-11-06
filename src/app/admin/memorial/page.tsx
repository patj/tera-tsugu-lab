import Link from "next/link";
import { listOfficiants } from "@/domain/calendar";
import { addDays, formatJst, jst, jstTimeString, parseDateString, todayJst } from "@/domain/core";
import {
  LOCATION_LABELS,
  isMemorialLocation,
  listMemorialRequests,
  listMemorialServices,
  type MemorialServiceStatus,
} from "@/domain/memorial";
import { getCurrentStaff, getStaffActor } from "@/lib/staff-auth";
import { input, JointBadge, MemorialTabs, ServiceStatusBadge, TargetsList } from "./ui";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");
function validDate(s: string): string | null {
  try {
    parseDateString(s);
    return s;
  } catch {
    return null;
  }
}

export default async function MemorialServicesPage({ searchParams }: PageProps<"/admin/memorial">) {
  const staff = await getCurrentStaff();
  const actor = await getStaffActor();
  const sp = await searchParams;
  const today = todayJst();
  const from = validDate(one(sp.from)) ?? today;
  const to = validDate(one(sp.to));
  const officiant = one(sp.officiant);
  const location = one(sp.location);
  const showAll = one(sp.show) === "all";

  const officiants = await listOfficiants(staff.templeId);
  const statuses: MemorialServiceStatus[] = showAll ? ["scheduled", "done", "cancelled"] : ["scheduled"];
  const list = await listMemorialServices(actor, {
    from: jst(from),
    to: to ? jst(addDays(to, 1)) : undefined,
    officiantStaffId: officiant || undefined,
    location: isMemorialLocation(location) ? location : undefined,
    statuses,
  });
  const open = await listMemorialRequests(actor, { statuses: ["requested"] });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">年忌法要</h1>
        <MemorialTabs />
      </div>

      {open.length > 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-lg">
          日時が決まっていない申し込みが <strong>{open.length} 件</strong> あります。{" "}
          <Link href="/admin/memorial/requests" className="underline">
            申し込みを見る
          </Link>
        </p>
      )}

      <form className="flex flex-wrap items-end gap-3 rounded border border-stone-200 bg-white p-3">
        <label className="block">
          <span className="text-sm text-stone-600">期間（から）</span>
          <input type="date" name="from" defaultValue={from} className={input} />
        </label>
        <label className="block">
          <span className="text-sm text-stone-600">期間（まで）</span>
          <input type="date" name="to" defaultValue={to ?? ""} className={input} />
        </label>
        <label className="block">
          <span className="text-sm text-stone-600">法要の担当者</span>
          <select name="officiant" defaultValue={officiant} className={input}>
            <option value="">すべて</option>
            {officiants.map((o) => (
              <option key={o.id} value={o.id}>
                {o.roleTitle} {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-stone-600">場所</span>
          <select name="location" defaultValue={location} className={input}>
            <option value="">すべて</option>
            {Object.entries(LOCATION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" name="show" value="all" defaultChecked={showAll} /> 済み・取り消しも出す
        </label>
        <button type="submit" className="rounded border border-stone-400 bg-white px-4 py-2 hover:bg-stone-50">
          絞り込む
        </button>
      </form>

      {list.length === 0 ? (
        <p className="text-stone-600">この条件の法要はありません。</p>
      ) : (
        <div className="overflow-x-auto rounded border border-stone-200 bg-white">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-stone-200 bg-stone-50 text-sm text-stone-600">
              <tr>
                <th className="px-3 py-2">日時</th>
                <th className="px-3 py-2">世帯</th>
                <th className="px-3 py-2">故人と回忌</th>
                <th className="px-3 py-2">場所</th>
                <th className="px-3 py-2">法要の担当者</th>
                <th className="px-3 py-2">状態</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-b border-stone-100 align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/admin/memorial/services/${s.id}`} className="underline">
                      {formatJst(s.startAt)}〜{jstTimeString(s.endAt)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {s.householdName}
                    {s.joint && <JointBadge />}
                  </td>
                  <td className="px-3 py-2">
                    <TargetsList targets={s.targets} />
                  </td>
                  <td className="px-3 py-2">{LOCATION_LABELS[s.location]}</td>
                  <td className="px-3 py-2">{s.officiant.label}</td>
                  <td className="px-3 py-2">
                    <ServiceStatusBadge status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
