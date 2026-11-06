// 法要の申し込みフォーム（窓口、または can_apply_memorial の家族）
import { getMemorialApplyOptions } from "@/domain/portal";
import { requirePortal } from "@/lib/portal-auth";
import { ErrorBox, Forbidden, PageTitle } from "../../../_components/ui";
import { ApplyForm } from "./apply-form";

export const metadata = { title: "法要の申し込み | 檀家ポータル" };

export default async function MemorialApplyPage({ searchParams }: PageProps<"/portal/memorial/apply">) {
  const sp = await searchParams;
  const { actor, ctx } = await requirePortal();
  if (!ctx.can.applyMemorial) return <Forbidden contactName={ctx.contactName} what="法要の申し込み" />;
  const opts = await getMemorialApplyOptions(actor);

  return (
    <main>
      <PageTitle back="/portal/memorial">法要の申し込み</PageTitle>
      <p className="mb-5">
        ご希望をお寺にお送りします。<strong>この時点では日時は決まりません。</strong>
        お寺で担当と本堂の空きを確かめて、日時が確定したら「申し込みの状況」に表示します。
      </p>
      <ErrorBox message={sp.error} />
      {opts.deceased.length === 0 ? (
        <p className="rounded-xl bg-white px-5 py-4">過去帳に故人が登録されていません。お寺にお問い合わせください。</p>
      ) : (
        <ApplyForm opts={opts} />
      )}
    </main>
  );
}
