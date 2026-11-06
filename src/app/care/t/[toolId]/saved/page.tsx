// 保存のあと。危機を検知したとき（?support=1）は、相談窓口を目立つように出す
// （本人には必ず出す。共有の有無とは関係ない。spec.md §7）
import Link from "next/link";
import { CrisisResources } from "@/care-sdk";
import { requireCareSession } from "@/lib/care-auth";
import { loadCareTool } from "../../../_components/tool";
import { DoneBox, PageTitle } from "../../../_components/ui";

export default async function CareSavedPage({ params, searchParams }: PageProps<"/care/t/[toolId]/saved">) {
  await requireCareSession();
  const { toolId, manifest } = loadCareTool((await params).toolId);
  const support = (await searchParams).support === "1";
  const base = `/care/t/${encodeURIComponent(toolId)}`;
  return (
    <main>
      <PageTitle back={base}>{manifest.name}</PageTitle>
      {support && (
        <div className="mb-6">
          <CrisisResources emphasis />
        </div>
      )}
      <DoneBox>記録しました。書いてくださって、ありがとうございます。</DoneBox>
      <div className="grid gap-3">
        <Link href={`${base}/history`} className="block rounded-xl border border-stone-300 bg-white px-5 py-4 text-center">
          これまでの記録をふりかえる
        </Link>
        <Link href="/care" className="block rounded-xl border border-stone-300 bg-white px-5 py-4 text-center">
          はじめの画面へ
        </Link>
      </div>
    </main>
  );
}
