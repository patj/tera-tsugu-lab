import Link from "next/link";
import { formatJst } from "@/domain/core";
import {
  LOCATION_LABELS,
  REQUEST_SOURCE_LABELS,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  listMemorialRequests,
  type MemorialRequestStatus,
} from "@/domain/memorial";
import { getStaffActor } from "@/lib/staff-auth";
import { JointBadge, MemorialTabs, RequestStatusBadge, TargetsList, dateLabel } from "../ui";

export default async function MemorialRequestsPage({ searchParams }: PageProps<"/admin/memorial/requests">) {
  const actor = await getStaffActor();
  const { status } = await searchParams;
  const filter = REQUEST_STATUSES.includes(status as MemorialRequestStatus) ? (status as MemorialRequestStatus) : null;
  const list = await listMemorialRequests(actor, { statuses: filter ? [filter] : undefined });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">法要の申し込み</h1>
        <MemorialTabs />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[null, ...REQUEST_STATUSES].map((k) => (
          <Link
            key={k ?? "all"}
            href={k ? `/admin/memorial/requests?status=${k}` : "/admin/memorial/requests"}
            className={`rounded-full border px-4 py-1.5 ${k === filter ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white"}`}
          >
            {k ? REQUEST_STATUS_LABELS[k] : "すべて"}
          </Link>
        ))}
      </div>
      <p className="text-stone-600">受付済み（日時が決まっていないもの）を、先に来た順に上に並べています。</p>

      {list.length === 0 ? (
        <p className="text-stone-600">申し込みはありません。</p>
      ) : (
        <div className="overflow-x-auto rounded border border-stone-200 bg-white">
          <table className="w-full min-w-[820px] text-left">
            <thead className="border-b border-stone-200 bg-stone-50 text-sm text-stone-600">
              <tr>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2">受付</th>
                <th className="px-3 py-2">世帯</th>
                <th className="px-3 py-2">故人と回忌</th>
                <th className="px-3 py-2">希望の時期</th>
                <th className="px-3 py-2">場所</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className={`border-b border-stone-100 align-top last:border-0 ${r.status === "requested" ? "bg-amber-50/50" : ""}`}>
                  <td className="px-3 py-2">
                    <RequestStatusBadge status={r.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/admin/memorial/requests/${r.id}`} className="underline">
                      {formatJst(r.createdAt)}
                    </Link>
                    <div className="text-sm text-stone-600">
                      {REQUEST_SOURCE_LABELS[r.source]}
                      {r.requestedByName ? `・${r.requestedByName}` : r.staffName ? `・${r.staffName}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.householdName}
                    {r.targets.length > 1 && <JointBadge />}
                  </td>
                  <td className="px-3 py-2">
                    <TargetsList targets={r.targets} />
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {r.service ? (
                      <span>確定: {formatJst(r.service.startAt)}</span>
                    ) : (
                      r.preferredPeriods.map((p, i) => (
                        <div key={i}>
                          第 {i + 1}: {dateLabel(p.from)}〜{dateLabel(p.to)}
                        </div>
                      ))
                    )}
                  </td>
                  <td className="px-3 py-2">{LOCATION_LABELS[r.location]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
