// ふりかえる（本体が復号した自分の記録を、ツールの History に渡す）
import { listMyCareEntries } from "@/domain/care";
import { requireCareSession } from "@/lib/care-auth";
import { loadCareTool } from "../../../_components/tool";
import { PageTitle, ToolTabs } from "../../../_components/ui";

export default async function CareHistoryPage({ params }: PageProps<"/care/t/[toolId]/history">) {
  const { actor } = await requireCareSession();
  const { toolId, manifest, views } = loadCareTool((await params).toolId);
  const entries = await listMyCareEntries(actor, toolId);
  const { History } = views;
  return (
    <main>
      <PageTitle>
        <span aria-hidden className="mr-2">
          {manifest.icon}
        </span>
        {manifest.name}
      </PageTitle>
      <ToolTabs manifest={manifest} current="history" />
      <History manifest={manifest} entries={entries} />
    </main>
  );
}
