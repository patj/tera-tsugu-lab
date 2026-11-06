import { todayJst } from "@/domain/core";
import { KIND_LABELS, listFacilities, parseDateOrNull } from "@/domain/facility";
import { getCurrentStaff } from "@/lib/staff-auth";
import { FacilityTabs } from "../ui";
import { NewReservationForm } from "./new-form";

export default async function NewReservationPage({ searchParams }: PageProps<"/admin/facility/new">) {
  const staff = await getCurrentStaff();
  const { date } = await searchParams;
  const facilities = await listFacilities(staff.templeId);
  const kinds = (["photo", "tea", "other"] as const).map((k) => ({ value: k, label: KIND_LABELS[k] }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">予約を登録する</h1>
        <FacilityTabs />
      </div>
      <p className="text-stone-600">電話などで受けた施設の利用を登録します。法要は法要の受付から登録してください。</p>
      <NewReservationForm
        facilities={facilities.map((f) => ({ id: f.id, name: f.name }))}
        kinds={kinds}
        defaultDate={parseDateOrNull(date) ?? todayJst()}
      />
    </div>
  );
}
