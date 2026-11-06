// 共有されている記録（ツールの AdminView に、本体が復号した記録を渡す）。開くたびに監査ログに残る
import Link from "next/link";
import { notFound } from "next/navigation";
import { CARE_TOOL_VIEWS } from "@/care-sdk/views.generated";
import { CareEntryList } from "@/care-sdk";
import { isDomainError } from "@/domain/core";
import { findCareTool, listSharedCareEntries, type SharedCareEntries } from "@/domain/care";
import { getStaffActor } from "@/lib/staff-auth";

export const metadata = { title: "共有されている記録 | こころのケア" };

export default async function AdminCareEntriesPage({ params }: PageProps<"/admin/care/subjects/[subjectId]/[toolId]">) {
  const actor = await getStaffActor();
  const p = await params;
  const toolId = decodeURIComponent(p.toolId);
  let result: SharedCareEntries;
  try {
    result = await listSharedCareEntries(actor, p.subjectId, toolId);
  } catch (e) {
    if (isDomainError(e) && e.code === "not_found") notFound();
    throw e;
  }
  const def = findCareTool(toolId);
  const views = CARE_TOOL_VIEWS[toolId];

  return (
    <div className="text-lg">
      <Link href="/admin/care" className="text-base underline">
        ← こころのケア
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        {result.nickname} さん・{result.toolName}
      </h1>
      <p className="mt-1 text-base text-stone-600">この画面を開いたことは、監査ログに残ります。</p>
      <div className="mt-6 max-w-2xl">
        {!result.shared ? (
          <p className="rounded border border-stone-300 bg-stone-100 px-4 py-3">この相談者は、このツールを共有していません（共有をやめた可能性があります）。</p>
        ) : def && views ? (
          <views.AdminView manifest={def.manifest} entries={result.entries} nickname={result.nickname} />
        ) : def ? (
          <CareEntryList manifest={def.manifest} entries={result.entries} showCrisis />
        ) : (
          <p>このツールは、もう使われていません（{result.entries.length} 件の記録があります）。</p>
        )}
      </div>
    </div>
  );
}
