// ご家族の権限（窓口だけ）。家族ごとに「家の情報を見る」「代わりに法要を申し込む」を設定する（初期値はどちらもオフ）
import { listFamilyPermissions } from "@/domain/portal";
import { requirePortal } from "@/lib/portal-auth";
import { PortalForm } from "../../_components/portal-form";
import { Card, DoneBox, ErrorBox, PageTitle } from "../../_components/ui";

export const metadata = { title: "ご家族の権限 | 檀家ポータル" };

export default async function FamilyPage({ searchParams }: PageProps<"/portal/family">) {
  const sp = await searchParams;
  const { actor, ctx } = await requirePortal();
  if (!ctx.can.manageFamily) {
    return (
      <main>
        <PageTitle>ご家族の権限</PageTitle>
        <p>ご家族の権限は、窓口の{ctx.contactName ? ` ${ctx.contactName} さん` : "方"}だけが設定できます。</p>
      </main>
    );
  }
  const family = await listFamilyPermissions(actor);

  return (
    <main>
      <PageTitle>ご家族の権限</PageTitle>
      <p className="mb-5">
        ポータルに登録したご家族ごとに、できることを選べます。どちらも、はじめはオフです。
        行事への申し込みと施設の空き状況は、どなたでも使えます。
      </p>
      {sp.done && <DoneBox>ご家族の権限を保存しました。</DoneBox>}
      <ErrorBox message={sp.error} />
      {family.length === 0 && <p className="rounded-xl bg-white px-5 py-4">ほかのご家族は登録されていません。</p>}
      <ul className="space-y-4">
        {family.map((m) => (
          <li key={m.personId}>
            <Card>
              <p className="text-xl font-bold">
                {m.name}
                {m.relation && <span className="ml-2 text-base font-normal text-stone-600">（{m.relation}）</span>}
              </p>
              {m.account ? (
                <PortalForm action="/portal/family/submit" submitLabel="この内容で保存する" className="mt-3 space-y-3">
                  <input type="hidden" name="accountId" value={m.account.id} />
                  <label className="flex items-start gap-3 rounded-lg border border-stone-300 px-4 py-3">
                    <input type="checkbox" name="canViewHousehold" value="1" defaultChecked={m.account.canViewHousehold} className="mt-1 size-6" />
                    <span>
                      <span className="block font-bold">家の情報を見る</span>
                      <span className="block text-base text-stone-600">家系図と、家の法要の予定・申し込みの状況を見られます</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-lg border border-stone-300 px-4 py-3">
                    <input type="checkbox" name="canApplyMemorial" value="1" defaultChecked={m.account.canApplyMemorial} className="mt-1 size-6" />
                    <span>
                      <span className="block font-bold">代わりに法要を申し込む</span>
                      <span className="block text-base text-stone-600">窓口の代わりに、法要を申し込めます（誰が申し込んだかが記録されます）</span>
                    </span>
                  </label>
                </PortalForm>
              ) : (
                <p className="mt-2 text-base text-stone-600">まだポータルに登録していません。登録には、お寺が発行する招待コードが必要です。</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
