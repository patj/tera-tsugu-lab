import Link from "next/link";
import { notFound } from "next/navigation";
import { formatJst, isDomainError, jstDateString, jstTimeString } from "@/domain/core";
import { statusLabel as reservationStatusLabel } from "@/domain/facility";
import {
  getMemorialService,
  LOCATION_LABELS,
  REQUEST_SOURCE_LABELS,
  requestStatusLabel,
  type MemorialRequestSource,
  type MemorialServiceDetail,
} from "@/domain/memorial";
import { getStaffActor } from "@/lib/staff-auth";
import { CancelServiceForm } from "../../forms";
import { JointBadge, MemorialTabs, Row, ServiceStatusBadge, TargetsList } from "../../ui";

export default async function MemorialServiceDetailPage({ params, searchParams }: PageProps<"/admin/memorial/services/[id]">) {
  const actor = await getStaffActor();
  const { id } = await params;
  const { booked } = await searchParams;
  let s: MemorialServiceDetail;
  try {
    s = await getMemorialService(actor, id);
  } catch (e) {
    if (isDomainError(e)) notFound();
    throw e;
  }
  const holdNote =
    s.location === "temple"
      ? "前後の準備と片付けを含む"
      : `行き ${s.travelBeforeMin ?? 0} 分・帰り ${s.travelAfterMin ?? 0} 分の移動時間を含む`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">法要の詳細</h1>
        <MemorialTabs />
      </div>

      {booked === "1" && s.status === "scheduled" && (
        <p className="rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-lg">
          法要を登録しました。担当者の予定{s.location === "temple" ? "と本堂の予約" : ""}も登録しました。
        </p>
      )}

      <section className="rounded border border-stone-200 bg-white p-4">
        <h2 className="mb-2 text-xl font-bold">
          {s.title} {s.joint && <JointBadge />}
        </h2>
        <dl>
          <Row label="状態">
            <ServiceStatusBadge status={s.status} />
          </Row>
          <Row label="日時">
            {formatJst(s.startAt)}〜{jstTimeString(s.endAt)}（{s.durationMin} 分）
          </Row>
          <Row label="場所">
            {LOCATION_LABELS[s.location]}
            {s.locationAddress && <span className="text-stone-600">（{s.locationAddress}）</span>}
          </Row>
          <Row label="法要の担当者">{s.officiant.label}</Row>
          <Row label="押さえる時間">
            {jstTimeString(s.hold.start)}〜{jstTimeString(s.hold.end)}（{holdNote}）
          </Row>
          <Row label="世帯">
            <Link href={`/admin/ledger/households/${s.household.id}`} className="underline">
              {s.household.name}
            </Link>
            {s.household.phone && <span className="ml-2 text-stone-600">{s.household.phone}</span>}
          </Row>
          <Row label="故人と回忌">
            <TargetsList targets={s.targets} />
          </Row>
          <Row label="施主">{s.seshuDisplay ?? "—"}</Row>
          {s.notes && <Row label="メモ">{s.notes}</Row>}
          <Row label="申し込み">
            {s.request ? (
              <Link href={`/admin/memorial/requests/${s.request.id}`} className="underline">
                {REQUEST_SOURCE_LABELS[s.request.source as MemorialRequestSource] ?? s.request.source}で受付（{formatJst(s.request.createdAt)}
                {s.request.requestedByName ? `、${s.request.requestedByName}さん` : s.request.staffName ? `、${s.request.staffName}` : ""}）・
                {requestStatusLabel(s.request.status)}
              </Link>
            ) : (
              "—"
            )}
          </Row>
        </dl>
      </section>

      <section className="rounded border border-stone-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-bold">ひもづく予定と予約</h2>
        <dl>
          <Row label="担当者の予定">
            {s.staffEvents.length === 0
              ? "なし"
              : s.staffEvents.map((e) => (
                  <div key={e.id}>
                    <Link href={`/admin/calendar?date=${jstDateString(e.start)}`} className="underline">
                      {formatJst(e.start)}〜{jstTimeString(e.end)} {e.title}
                    </Link>
                  </div>
                ))}
          </Row>
          <Row label="本堂の予約">
            {s.location !== "temple"
              ? "なし（自宅・墓前）"
              : s.reservations.length === 0
                ? "なし"
                : s.reservations.map((r) => (
                    <div key={r.id}>
                      <Link href={`/admin/facility/${r.id}`} className="underline">
                        {r.facilityName} {formatJst(r.start)}〜{jstTimeString(r.end)}（{reservationStatusLabel(r.status)}）
                      </Link>
                      {r.requestCode && <span className="ml-2 font-mono text-sm text-stone-600">{r.requestCode}</span>}
                    </div>
                  ))}
          </Row>
        </dl>
        <p className="mt-2 text-sm text-stone-600">法要にひもづく予定と予約は、カレンダーや施設予約の画面からは変えられません。この画面から取り消してください。</p>
      </section>

      {s.status === "scheduled" && (
        <section className="rounded border border-stone-200 bg-white p-4">
          <h2 className="mb-2 text-lg font-bold">取り消し</h2>
          <p className="mb-3 text-stone-700">
            取り消すと、担当者の予定と本堂の予約も取り消します。申し込みは「受付済み」に戻るので、日時を決め直せます。
          </p>
          <CancelServiceForm id={s.id} />
        </section>
      )}
    </div>
  );
}
