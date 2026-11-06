// 記録する（ツールの Entry を表示し、保存の action を渡す）
import { requireCareSession } from "@/lib/care-auth";
import { saveCareEntryAction } from "../../actions";
import { loadCareTool } from "../../_components/tool";
import { ErrorBox, PageTitle, ToolTabs } from "../../_components/ui";

export default async function CareEntryPage({ params, searchParams }: PageProps<"/care/t/[toolId]">) {
  await requireCareSession();
  const { toolId, manifest, views } = loadCareTool((await params).toolId);
  const sp = await searchParams;
  const { Entry } = views;
  return (
    <main>
      <PageTitle>
        <span aria-hidden className="mr-2">
          {manifest.icon}
        </span>
        {manifest.name}
      </PageTitle>
      <ToolTabs manifest={manifest} current="entry" />
      <ErrorBox message={sp.error} />
      <Entry manifest={manifest} action={saveCareEntryAction.bind(null, toolId)} />
    </main>
  );
}
