import Link from "next/link";
import { notFound } from "next/navigation";
import { formatJst, isDomainError } from "@/domain/core";
import {
  findConcurrentReservations,
  formatRange,
  getReservation,
  kindLabel,
  statusLabel,
  withParty,
  type Reservation,
} from "@/domain/facility";
import { getCurrentStaff } from "@/lib/staff-auth";
import { FacilityTabs, KindBadge, StatusBadge } from "../ui";
import { ApproveForm, CancelForm, RejectForm } from "./review-forms";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 border-b border-stone-100 py-2 last:border-0">
      <dt className="text-stone-600">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function brief(r: Reservation) {
  return `${r.facilityName} ${formatRange(r.start, r.end)} ${kindLabel(r.kind)}（${statusLabel(r.status)}）${r.title ? ` ${r.title}` : ""}`;
}

export default async function ReservationDetailPage({ params }: PageProps<"/admin/facility/[id]">) {
  const staff = await getCurrentStaff();
  const { id } = await params;
  let base: Reservation;
  try {
    base = await getReservation(staff.templeId, id);
  } catch (e) {
    if (isDomainError(e)) notFound();
    throw e;
  }
  const [r] = await withParty([base]);
  const concurrent = r.status === "pending" ? await findConcurrentReservations(staff.templeId, r) : null;
  const memorials = concurrent?.otherFacilities.filter((x) => x.kind === "memorial") ?? [];
  const others = concurrent?.otherFacilities.filter((x) => x.kind !== "memorial") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">予約の詳細</h1>
        <FacilityTabs />
      </div>

      <dl className="rounded border border-stone-200 bg-white px-4 py-2 text-lg">
        <Row label="状態">
          <StatusBadge status={r.status} />
        </Row>
        <Row label="施設">{r.facilityName}</Row>
        <Row label="日時">{formatRange(r.start, r.end)}</Row>
        <Row label="種類">
          <KindBadge kind={r.kind} />
        </Row>
        {r.title && <Row label="件名">{r.title}</Row>}
        {r.partyName && (
          <Row label="申請者">
            {r.partyName}
            {r.contactPhone && <span className="ml-3">電話 {r.contactPhone}</span>}
            {r.contactEmail && <span className="ml-3">{r.contactEmail}</span>}
          </Row>
        )}
        {r.notes && <Row label="内容">{<span className="whitespace-pre-wrap">{r.notes}</span>}</Row>}
        {r.rejectReason && <Row label="お断りの理由">{r.rejectReason}</Row>}
        <Row label="申請番号">
          <span className="font-mono">{r.requestCode}</span>
        </Row>
        <Row label="受付日時">{formatJst(r.createdAt)}</Row>
      </dl>

      {concurrent && (
        <section className="space-y-2 rounded border border-stone-200 bg-white px-4 py-3">
          <h2 className="text-lg font-bold">重なりの確認</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              {concurrent.sameFacility.length === 0
                ? `同じ施設（${r.facilityName}）の法要・予約とは重なりません`
                : concurrent.sameFacility.map(brief).join("、")}
            </li>
            <li>{memorials.length === 0 ? "同じ時間の法要はありません" : `同じ時間の法要: ${memorials.map(brief).join("、")}`}</li>
            {others.length > 0 && <li>同じ時間のほかの施設の予約: {others.map(brief).join("、")}</li>}
          </ul>
        </section>
      )}

      {r.status === "pending" && (
        <section className="grid gap-6 rounded border border-amber-300 bg-amber-50 px-4 py-4 md:grid-cols-2">
          <div>
            <h2 className="mb-2 text-lg font-bold">承認</h2>
            <ApproveForm id={r.id} />
          </div>
          <div>
            <h2 className="mb-2 text-lg font-bold">お断り</h2>
            <RejectForm id={r.id} />
          </div>
        </section>
      )}

      {(r.status === "pending" || r.status === "confirmed") && !r.memorialServiceId && (
        <section>
          <CancelForm id={r.id} />
        </section>
      )}
      {r.memorialServiceId && (
        <p className="text-stone-600">この予約は法要にひもづいています。取り消すときは、法要の画面から法要を取り消してください。</p>
      )}

      <p>
        <Link href="/admin/facility" className="underline">
          予約の一覧に戻る
        </Link>
      </p>
    </div>
  );
}
