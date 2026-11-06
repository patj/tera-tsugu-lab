// こころのケア（管理画面）: 危機アラートと、共有している相談者の一覧。spec.md §7
// 今も共有に同意している人の分だけを出す。アラートの表示は監査ログに残る
import Link from "next/link";
import { CrisisResources } from "@/care-sdk";
import { formatJst } from "@/domain/core";
import { listCareAlerts, listCareTools, listSharedCareSubjects } from "@/domain/care";
import { getStaffActor } from "@/lib/staff-auth";
import { markCareAlertSeenAction } from "./actions";

export const metadata = { title: "こころのケア" };

export default async function AdminCarePage({ searchParams }: PageProps<"/admin/care">) {
  const actor = await getStaffActor();
  const sp = await searchParams;
  const showSeen = sp.seen === "1";
  const [alerts, subjects] = await Promise.all([listCareAlerts(actor, { includeSeen: showSeen }), listSharedCareSubjects(actor)]);
  const tools = listCareTools();
  const back = showSeen ? "/admin/care?seen=1" : "/admin/care";

  return (
    <div className="text-lg">
      <h1 className="text-2xl font-bold">こころのケア</h1>
      <p className="mt-2 text-base text-stone-600">
        相談者が「お寺と共有する」にしたツールの記録だけが見えます。共有をやめると、すぐに見えなくなります。記録を開くと、監査ログに残ります。
        ケアのデータは MCP（Claude Desktop）からは扱えません。
      </p>
      {typeof sp.error === "string" && <p className="my-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">{sp.error}</p>}

      <section className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold">危機アラート{!showSeen && `（未確認 ${alerts.length} 件）`}</h2>
          <Link href={showSeen ? "/admin/care" : "/admin/care?seen=1"} className="text-base underline">
            {showSeen ? "未確認だけを表示" : "確認済みも表示"}
          </Link>
        </div>
        {alerts.length === 0 ? (
          <p className="mt-3 text-stone-600">{showSeen ? "アラートはありません。" : "未確認のアラートはありません。"}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {alerts.map((a) => (
              <li key={a.id} className={`rounded border bg-white px-4 py-3 ${a.seenAt ? "border-stone-200" : "border-rose-400"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p>
                      <span className="font-bold">{a.nickname}</span> さん・{a.toolName}
                    </p>
                    <p className="text-base text-stone-600">
                      {formatJst(a.createdAt)} の記録
                      {a.seenAt && `（${formatJst(a.seenAt)} に ${a.seenByName ?? "スタッフ"} が確認）`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link href={`/admin/care/subjects/${a.subjectId}/${encodeURIComponent(a.toolId)}`} className="underline">
                      記録を開く
                    </Link>
                    {!a.seenAt && (
                      <form action={markCareAlertSeenAction}>
                        <input type="hidden" name="alertId" value={a.id} />
                        <input type="hidden" name="back" value={back} />
                        <button type="submit" className="rounded border border-stone-300 px-3 py-1 text-base">
                          確認した
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold">共有している相談者</h2>
        <table className="mt-3 w-full border-collapse bg-white">
          <thead>
            <tr className="border-b border-stone-300 text-left text-base text-stone-600">
              <th className="px-3 py-2">ニックネーム</th>
              <th className="px-3 py-2">ツール</th>
              <th className="px-3 py-2">共有した日時</th>
              <th className="px-3 py-2">記録</th>
              <th className="px-3 py-2">最後の記録</th>
              <th className="px-3 py-2">未確認のアラート</th>
            </tr>
          </thead>
          <tbody>
            {subjects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-stone-500">
                  共有している相談者はいません
                </td>
              </tr>
            )}
            {subjects.map((s) => (
              <tr key={`${s.subjectId}/${s.toolId}`} className="border-b border-stone-200">
                <td className="px-3 py-3">
                  <Link href={`/admin/care/subjects/${s.subjectId}/${encodeURIComponent(s.toolId)}`} className="font-medium underline">
                    {s.nickname}
                  </Link>
                </td>
                <td className="px-3 py-3">{s.toolName}</td>
                <td className="px-3 py-3 text-base">{formatJst(s.sharedSince)}</td>
                <td className="px-3 py-3 text-base">{s.entryCount} 件</td>
                <td className="px-3 py-3 text-base">{s.lastEntryAt ? formatJst(s.lastEntryAt) : "—"}</td>
                <td className="px-3 py-3 text-base">{s.unseenAlerts > 0 ? <span className="font-bold text-rose-800">{s.unseenAlerts} 件</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold">ケアのツール（{tools.length} 件）</h2>
        {tools.length === 0 ? (
          <p className="mt-3 text-base text-stone-600">
            まだツールがありません。Claude Code で「〇〇のツールを作りたい」と伝えると、ひな形からツールを作れます（docs/care-tools-guide.md）。
          </p>
        ) : (
          <ul className="mt-3 list-disc pl-6 text-base">
            {tools.map((t) => (
              <li key={t.id}>
                {t.icon} {t.name}（{t.id}）: {t.description}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-base text-stone-600">
          相談者向けの画面は <Link href="/care" className="underline">/care</Link> です（匿名で使います）。
        </p>
      </section>

      <details className="mt-10">
        <summary className="cursor-pointer text-base text-stone-600">相談者に案内する相談窓口</summary>
        <div className="mt-3 max-w-xl">
          <CrisisResources />
        </div>
      </details>
    </div>
  );
}
