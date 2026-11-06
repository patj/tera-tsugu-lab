// お寺のアプリ（管理画面）: アプリの一覧と、お寺と共有している利用者の一覧。spec.md §7
import Link from "next/link";
import { formatJst } from "@/domain/core";
import { listApps, listSharedAppUsers } from "@/domain/apps";
import { getStaffActor } from "@/lib/staff-auth";

export const metadata = { title: "お寺のアプリ" };

export default async function AdminAppsPage() {
  const actor = await getStaffActor();
  const apps = listApps();
  const users = await listSharedAppUsers(actor);

  return (
    <div className="text-lg">
      <h1 className="text-2xl font-bold">お寺のアプリ</h1>
      <p className="mt-2 text-base text-stone-600">
        利用者が「お寺と共有する」にしたアプリのデータだけが見えます（読むだけ）。共有をやめると、すぐに見えなくなります。データを開くと監査ログに残ります。
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
                <td className="px-3 py-3 text-base">{u.docCount} 件</td>
                <td className="px-3 py-3 text-base">{u.lastUpdatedAt ? formatJst(u.lastUpdatedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

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
                {a.icon} <span className="font-bold">{a.name}</span>（{a.id}）{a.sharing ? "・お寺との共有あり" : ""}: {a.description}
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
