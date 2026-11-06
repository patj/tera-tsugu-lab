// 招待コードの発行と一覧。世帯を選んで、家族ごとに発行する。印刷の画面（QR コードつき）へ進める
import Link from "next/link";
import { jstDateString } from "@/domain/core";
import { listActiveHouseholds } from "@/domain/ledger";
import { INVITE_STATUS_LABELS, listInviteCandidates, listPortalInvites, type InviteStatus } from "@/domain/portal";
import { getStaffActor } from "@/lib/staff-auth";
import { issueInviteAction } from "../actions";
import { Banner, InviteBadge, PortalTabs, at } from "../ui";

export const metadata = { title: "招待コード | 檀家ポータル" };

const STATUSES: (InviteStatus | "all")[] = ["unused", "used", "expired", "all"];

export default async function InvitesPage({ searchParams }: PageProps<"/admin/portal/invites">) {
  const sp = await searchParams;
  const actor = await getStaffActor();
  const householdId = typeof sp.household === "string" ? sp.household : "";
  const status = STATUSES.includes(sp.status as InviteStatus) ? (sp.status as InviteStatus | "all") : "unused";
  const households = await listActiveHouseholds(actor.templeId);
  const candidates = householdId ? await listInviteCandidates(actor, householdId).catch(() => null) : null;
  const invites = await listPortalInvites(actor, { status, householdId: householdId || undefined });
  const issued = typeof sp.issued === "string" ? (await listPortalInvites(actor, { ids: [sp.issued] }))[0] : undefined;

  const printQuery = new URLSearchParams({ status, ...(householdId ? { household: householdId } : {}) }).toString();

  return (
    <div className="text-lg">
      <h1 className="text-2xl font-bold">檀家ポータル</h1>
      <PortalTabs current="invites" />
      <Banner
        error={sp.error}
        message={issued ? `${issued.personName} さんの招待コード ${issued.displayCode} を発行しました（有効期限 ${jstDateString(issued.expiresAt)}）。` : null}
      />
      {issued && (
        <p className="-mt-2 mb-4">
          <Link href={`/admin/portal/invites/print?ids=${issued.id}`} className="underline">
            この招待コードを印刷する
          </Link>
        </p>
      )}

      <section className="mt-4 rounded border border-stone-200 bg-white px-5 py-5">
        <h2 className="text-xl font-bold">招待コードを発行する</h2>
        <p className="mt-1 text-base text-stone-600">
          招待コードは個人ごとです（有効期限は 90 日。1 回だけ使えます）。登録済みの方に発行すると、メールアドレスの登録し直しに使えます。
        </p>
        <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            世帯
            <select name="household" defaultValue={householdId} className="mt-1 block min-w-60 rounded border border-stone-300 px-3 py-2">
              <option value="">選んでください</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}（{h.address ?? "住所なし"}）
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded border border-stone-400 px-4 py-2 hover:bg-stone-100">
            家族を表示
          </button>
        </form>
        {candidates && (
          <table className="mt-4 w-full border-collapse">
            <thead>
              <tr className="border-b border-stone-300 text-left text-base text-stone-600">
                <th className="px-3 py-2">{candidates.household.name}のご家族</th>
                <th className="px-3 py-2">続柄</th>
                <th className="px-3 py-2">ポータル</th>
                <th className="px-3 py-2">未使用のコード</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {candidates.members.map((m) => (
                <tr key={m.personId} className="border-b border-stone-200">
                  <td className="px-3 py-2">
                    {m.name}
                    {m.isContact && <span className="ml-2 rounded bg-sky-100 px-2 text-sm text-sky-900">窓口</span>}
                    {m.isHead && <span className="ml-1 rounded bg-stone-100 px-2 text-sm">世帯主</span>}
                  </td>
                  <td className="px-3 py-2 text-base">{m.relation ?? ""}</td>
                  <td className="px-3 py-2 text-base">{m.hasAccount ? "登録済み" : "未登録"}</td>
                  <td className="px-3 py-2 text-base">{m.unusedInvites} 件</td>
                  <td className="px-3 py-2">
                    <form action={issueInviteAction}>
                      <input type="hidden" name="personId" value={m.personId} />
                      <input type="hidden" name="householdId" value={candidates.household.id} />
                      <button type="submit" className="rounded bg-stone-800 px-3 py-1 text-base text-white">
                        {m.hasAccount ? "登録し直し用に発行" : "発行する"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">招待コードの一覧{candidates ? `（${candidates.household.name}）` : ""}</h2>
          <Link href={`/admin/portal/invites/print?${printQuery}`} className="rounded bg-stone-800 px-4 py-2 text-white">
            この一覧を印刷する（QR コードつき）
          </Link>
        </div>
        <nav className="mt-3 flex flex-wrap gap-2 text-base">
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/portal/invites?${new URLSearchParams({ status: s, ...(householdId ? { household: householdId } : {}) }).toString()}`}
              className={`rounded-full border px-3 py-1 ${s === status ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 bg-white"}`}
            >
              {s === "all" ? "すべて" : INVITE_STATUS_LABELS[s]}
            </Link>
          ))}
        </nav>
        <table className="mt-3 w-full border-collapse bg-white">
          <thead>
            <tr className="border-b border-stone-300 text-left text-base text-stone-600">
              <th className="px-3 py-2">世帯</th>
              <th className="px-3 py-2">お名前</th>
              <th className="px-3 py-2">招待コード</th>
              <th className="px-3 py-2">状態</th>
              <th className="px-3 py-2">有効期限</th>
              <th className="px-3 py-2">発行</th>
              <th className="px-3 py-2">使用</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-stone-500">
                  該当する招待コードはありません
                </td>
              </tr>
            )}
            {invites.map((i) => (
              <tr key={i.id} className="border-b border-stone-200">
                <td className="px-3 py-2">{i.householdName}</td>
                <td className="px-3 py-2">{i.personName}</td>
                <td className="px-3 py-2 font-mono tracking-wider">{i.displayCode}</td>
                <td className="px-3 py-2">
                  <InviteBadge status={i.status} />
                </td>
                <td className="px-3 py-2 text-base">{jstDateString(i.expiresAt)}</td>
                <td className="px-3 py-2 text-base">{at(i.createdAt)}</td>
                <td className="px-3 py-2 text-base">{at(i.usedAt)}</td>
                <td className="px-3 py-2 text-base">
                  {i.status === "unused" && (
                    <Link href={`/admin/portal/invites/print?ids=${i.id}`} className="underline">
                      印刷
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
