// ポータルのアカウントの一覧（誰が登録したか、最後のログイン、窓口か、家族の権限）
import Link from "next/link";
import { listPortalAccounts } from "@/domain/portal";
import { getStaffActor } from "@/lib/staff-auth";
import { OnOff, PortalTabs, at } from "./ui";

export const metadata = { title: "檀家ポータル" };

export default async function AdminPortalPage() {
  const actor = await getStaffActor();
  const accounts = await listPortalAccounts(actor);

  return (
    <div className="text-lg">
      <h1 className="text-2xl font-bold">檀家ポータル</h1>
      <PortalTabs current="accounts" />
      <p className="mt-4 text-base text-stone-600">
        窓口は台帳の世帯の「窓口」で決まります（窓口を変えるときは台帳で変えます）。家族の権限は、ふだんは窓口がポータルで設定します。
        窓口が登録していないときなどは、窓口の意向を確かめたうえで、各アカウントの画面から代わりに設定できます。
      </p>
      <table className="mt-4 w-full border-collapse bg-white">
        <thead>
          <tr className="border-b border-stone-300 text-left text-base text-stone-600">
            <th className="px-3 py-2">世帯</th>
            <th className="px-3 py-2">登録した方</th>
            <th className="px-3 py-2">立場</th>
            <th className="px-3 py-2">メールアドレス</th>
            <th className="px-3 py-2">家の情報を見る</th>
            <th className="px-3 py-2">代わりに申し込む</th>
            <th className="px-3 py-2">登録</th>
            <th className="px-3 py-2">最後のログイン</th>
          </tr>
        </thead>
        <tbody>
          {accounts.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-stone-500">
                アカウントはまだありません
              </td>
            </tr>
          )}
          {accounts.map((a) => (
            <tr key={a.id} className={`border-b border-stone-200 ${a.disabled ? "text-stone-400" : ""}`}>
              <td className="px-3 py-3">
                <Link href={`/admin/ledger/households/${a.householdId}`} className="underline">
                  {a.householdName}
                </Link>
              </td>
              <td className="px-3 py-3">
                <Link href={`/admin/portal/accounts/${a.id}`} className="font-medium underline">
                  {a.personName}
                </Link>
                {a.relation && <span className="ml-1 text-base text-stone-500">（{a.relation}）</span>}
              </td>
              <td className="px-3 py-3 text-base">{a.disabled ? "ログイン不可" : a.isContact ? "窓口" : "家族"}</td>
              <td className="px-3 py-3 text-base">{a.email}</td>
              <td className="px-3 py-3 text-base">{a.isContact ? "（窓口）" : <OnOff on={a.canViewHousehold} />}</td>
              <td className="px-3 py-3 text-base">{a.isContact ? "（窓口）" : <OnOff on={a.canApplyMemorial} />}</td>
              <td className="px-3 py-3 text-base">{at(a.createdAt)}</td>
              <td className="px-3 py-3 text-base">{at(a.lastLoginAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
