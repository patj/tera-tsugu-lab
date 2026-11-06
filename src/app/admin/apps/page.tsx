// お寺のアプリ（管理画面）: アプリの一覧と、お寺と共有している利用者の一覧。spec.md §7
import Link from "next/link";
import { appSharesPerDoc, appUsesSharing } from "@/apps-sdk/types";
import { formatJst } from "@/domain/core";
import { getAppAiUsageSummary, listApps, listSharedAppUsers } from "@/domain/apps";
import { getStaffActor } from "@/lib/staff-auth";

export const metadata = { title: "お寺のアプリ" };

export default async function AdminAppsPage() {
  const actor = await getStaffActor();
  const apps = listApps();
  const [users, aiUsage] = await Promise.all([listSharedAppUsers(actor), getAppAiUsageSummary(actor)]);
  const aiKeySet = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div className="text-lg">
      <h1 className="text-2xl font-bold">お寺のアプリ</h1>
      <p className="mt-2 text-base text-stone-600">
        利用者が「お寺と共有する」にしたアプリのデータだけが見えます（読むだけ）。1 件ずつ共有するアプリでは、利用者が選んだものだけが見えます。
        共有をやめると、すぐに見えなくなります。データを開くと監査ログに残ります。
        お寺のアプリのデータは MCP（Claude Desktop）からは扱えません。
      </p>

      <section className="mt-6">
        <h2 className="text-xl font-bold">共有している利用者</h2>
        <table className="mt-3 w-full border-collapse bg-white">
          <thead>
            <tr className="border-b border-stone-300 text-left text-base text-stone-600">
              <th className="px-3 py-2">ニックネーム</th>
              <th className="px-3 py-2">アプリ</th>
              <th className="px-3 py-2">共有した日時</th>
              <th className="px-3 py-2">データ</th>
              <th className="px-3 py-2">最後の更新</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-stone-500">
                  共有している利用者はいません
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={`${u.userId}/${u.appId}`} className="border-b border-stone-200">
                <td className="px-3 py-3">
                  <Link href={`/admin/apps/${encodeURIComponent(u.appId)}/users/${u.userId}`} className="font-medium underline">
                    {u.nickname}
                  </Link>
                </td>
                <td className="px-3 py-3">{u.appName}</td>
                <td className="px-3 py-3 text-base">{formatJst(u.sharedSince)}</td>
                <td className="px-3 py-3 text-base">
                  {u.docCount} 件{u.perDoc && <span className="block text-sm text-stone-500">（選ばれたもの）</span>}
                </td>
                <td className="px-3 py-3 text-base">{u.lastUpdatedAt ? formatJst(u.lastUpdatedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {aiUsage.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">AI の使用（今月）</h2>
          <p className="mt-1 text-base text-stone-600">
            利用者が同意したときだけ、アプリが渡した内容を Claude に送ります（内容は保存しません）。費用は使用したトークン数からのおおよその額です。
            上限に達すると、そのアプリの AI は月末まで止まります（環境変数 APPS_AI_MONTHLY_BUDGET_USD / APPS_AI_BUDGETS_USD）。
            {!aiKeySet && <strong className="text-red-800"> API キー（ANTHROPIC_API_KEY）が設定されていないため、AI は使えません。</strong>}
          </p>
          <table className="mt-3 w-full border-collapse bg-white">
            <thead>
              <tr className="border-b border-stone-300 text-left text-base text-stone-600">
                <th className="px-3 py-2">アプリ</th>
                <th className="px-3 py-2">モデル</th>
                <th className="px-3 py-2">回数</th>
                <th className="px-3 py-2">うち失敗</th>
                <th className="px-3 py-2">費用 / 上限（米ドル）</th>
              </tr>
            </thead>
            <tbody>
              {aiUsage.map((u) => (
                <tr key={u.appId} className="border-b border-stone-200">
                  <td className="px-3 py-3">{u.appName}</td>
                  <td className="px-3 py-3 text-base">{u.model}</td>
                  <td className="px-3 py-3 text-base">{u.calls} 回</td>
                  <td className="px-3 py-3 text-base">{u.failures} 回</td>
                  <td className={`px-3 py-3 text-base ${u.costUsd >= u.budgetUsd ? "font-bold text-red-800" : ""}`}>
                    ${u.costUsd.toFixed(4)} / ${u.budgetUsd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-bold">アプリ（{apps.length} 件）</h2>
        {apps.length === 0 ? (
          <p className="mt-3 text-base text-stone-600">
            まだアプリがありません。Claude Code で「〇〇のアプリを作りたい」と伝えると、ひな形からアプリを作れます（docs/apps-guide.md）。
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-base">
            {apps.map((a) => (
              <li key={a.id}>
                {a.icon} <span className="font-bold">{a.name}</span>（{a.id}）{appSharesPerDoc(a) ? "・お寺との共有あり（1 件ずつ）" : appUsesSharing(a) ? "・お寺との共有あり" : ""}: {a.description}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-base text-stone-600">
          利用者の画面は <Link href="/apps" className="underline">/apps</Link> です（匿名で使います）。
        </p>
      </section>
    </div>
  );
}
