import { getDefaultTempleId } from "@/domain/core";
import {
  APPLY_PERIODS,
  KIND_LABELS,
  PUBLIC_KINDS,
  listFacilities,
  parseDateOrNull,
  publicApplyWindow,
  publicTimeOptions,
} from "@/domain/facility";
import { ApplyForm } from "./apply-form";

export default async function ReserveApplyPage({ searchParams }: PageProps<"/reserve/apply">) {
  const sp = await searchParams;
  const templeId = await getDefaultTempleId();
  const facilities = await listFacilities(templeId);
  const window = publicApplyWindow();
  const facility = facilities.find((f) => f.id === sp.facility)?.id ?? facilities[0]?.id ?? "";
  const date = parseDateOrNull(sp.date);
  const period = typeof sp.period === "string" && sp.period in APPLY_PERIODS ? sp.period : "am";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">施設の利用を申請する</h1>
      <p className="text-base text-stone-700">前撮りの撮影やお茶会などで、お寺の施設をご利用いただけます。</p>
      <ApplyForm
        facilities={facilities.map((f) => ({ id: f.id, name: f.name }))}
        kinds={PUBLIC_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
        periods={[
          ...Object.entries(APPLY_PERIODS).map(([value, p]) => ({ value, label: p.label })),
          { value: "custom", label: "時刻を指定する" },
        ]}
        timeOptions={publicTimeOptions()}
        minDate={window.first}
        maxDate={window.last}
        initial={{
          facilityId: facility,
          date: date && date >= window.first && date <= window.last ? date : "",
          period,
        }}
      />
    </div>
  );
}
