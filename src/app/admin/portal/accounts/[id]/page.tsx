// アカウントの詳細と、家族の権限の代行設定（窓口の意向を確かめて設定する。監査ログと対応記録に残る）
import Link from "next/link";
import { isDomainError } from "@/domain/core";
import { getPortalAccountForStaff } from "@/domain/portal";
import { getStaffActor } from "@/lib/staff-auth";
import { setPermissionsByStaffAction } from "../../actions";
import { Banner, OnOff, PortalTabs, at } from "../../ui";

export const metadata = { title: "ポータルのアカウント" };

export default async function AccountPage({ params, searchParams }: PageProps<"/admin/portal/accounts/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await getStaffActor();
  let detail;
  try {
    detail = await getPortalAccountForStaff(actor, id);
  } catch (e) {
    if (!isDomainError(e)) throw e;
    return (
      <div className="text-lg">
        <h1 className="text-2xl font-bold">檀家ポータル</h1>
        <PortalTabs current="accounts" />
        <p className="mt-6">{e.message}</p>
      </div>
    );
  }
  const { account: a, contact } = detail;

  return (
    <div className="text-lg">
      <h1 className="text-2xl font-bold">
        {a.householdName} {a.personName} さんのアカウント
      </h1>
      <PortalTabs current="accounts" />
      <Banner error={sp.error} message={sp.saved ? "権限を設定しました。監査ログと台帳の対応記録に残しました。" : null} />

      <dl className="mt-4 grid max-w-2xl grid-cols-[10rem_1fr] gap-x-4 gap-y-2 rounded border border-stone-200 bg-white px-5 py-4">
        <dt className="text-stone-600">立場</dt>
        <dd>{a.disabled ? "ログインできません（故人、または離檀・転出の世帯）" : a.isContact ? "窓口" : "家族"}</dd>
        <dt className="text-stone-600">メールアドレス</dt>
        <dd>{a.email}</dd>
        <dt className="text-stone-600">世帯の窓口</dt>
        <dd>
          {contact ? `${contact.name}（ポータル${contact.hasAccount ? "登録済み" : "未登録"}）` : "未設定"}{" "}
          <Link href={`/admin/ledger/households/${a.householdId}`} className="ml-2 text-base underline">
            台帳で見る
          </Link>
        </dd>
        <dt className="text-stone-600">家の情報を見る</dt>
        <dd>{a.isContact ? "（窓口はすべてできます）" : <OnOff on={a.canViewHousehold} />}</dd>
        <dt className="text-stone-600">代わりに申し込む</dt>
        <dd>{a.isContact ? "（窓口はすべてできます）" : <OnOff on={a.canApplyMemorial} />}</dd>
        <dt className="text-stone-600">登録</dt>
        <dd>{at(a.createdAt)}</dd>
        <dt className="text-stone-600">最後のログイン</dt>
        <dd>{at(a.lastLoginAt)}</dd>
      </dl>

      {!a.isContact && !a.disabled && (
        <section className="mt-8 max-w-2xl rounded border border-stone-200 bg-white px-5 py-5">
          <h2 className="text-xl font-bold">家族の権限を代わりに設定する</h2>
          <p className="mt-2 text-base text-stone-600">
            窓口がポータルに登録していない場合などに使います。必ず窓口の方の意向を（電話などで）確かめてから設定してください。
            設定したことは、監査ログと台帳の対応記録に残ります。
          </p>
          <form action={setPermissionsByStaffAction} className="mt-4 space-y-4">
            <input type="hidden" name="accountId" value={a.id} />
            <label className="flex items-center gap-3">
              <input type="checkbox" name="canViewHousehold" value="1" defaultChecked={a.canViewHousehold} className="size-5" />
              家の情報を見る（家系図と、家の法要の予定）
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" name="canApplyMemorial" value="1" defaultChecked={a.canApplyMemorial} className="size-5" />
              代わりに法要を申し込む
            </label>
            <label className="block">
              窓口の意向の確かめ方（必須）
              <input
                name="confirmation"
                required
                maxLength={500}
                placeholder={`例: 窓口の${contact?.name ?? ""}さんに電話で確認`}
                className="mt-1 block w-full rounded border border-stone-300 px-3 py-2"
              />
            </label>
            <button type="submit" className="rounded bg-stone-800 px-5 py-2 font-bold text-white">
              設定する
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
