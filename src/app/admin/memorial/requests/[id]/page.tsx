import Link from "next/link";
import { notFound } from "next/navigation";
import { formatJst, isDomainError, todayJst } from "@/domain/core";
import {
  getMemorialRequest,
  LOCATION_LABELS,
  REQUEST_SOURCE_LABELS,
  verifyMemorial,
  type MemorialRequestView,
} from "@/domain/memorial";
import { getStaffActor } from "@/lib/staff-auth";
import { BookingSection, intParam } from "../../booking-section";
import { DeclineForm } from "../../forms";
import { dateLabel, JointBadge, MemorialTabs, RequestStatusBadge, Row, TargetsList, VerifyResultView } from "../../ui";

export default async function MemorialRequestDetailPage({ params, searchParams }: PageProps<"/admin/memorial/requests/[id]">) {
  const actor = await getStaffActor();
  const { id } = await params;
  const sp = await searchParams;
  let r: MemorialRequestView;
  try {
    r = await getMemorialRequest(actor, id);
  } catch (e) {
    if (isDomainError(e)) notFound();
    throw e;
  }
  const today = todayJst();
  const first = r.preferredPeriods[0];
  const pick = typeof sp.p === "string" ? Number(sp.p) : NaN;
  const periods =
    Number.isInteger(pick) && r.preferredPeriods[pick]
      ? [r.preferredPeriods[pick]]
      : r.preferredPeriods.map((p) => ({ from: p.from < today ? today : p.from, to: p.to })).filter((p) => p.from <= p.to);

  const verifications =
    r.status === "requested"
      ? await Promise.all(
          r.targets.map(async (t) => ({
            target: t,
            result: await verifyMemorial(actor, {
              personId: t.personId,
              kaiki: t.kaiki,
              period: first ? { from: first.from, to: first.to } : null,
              today,
            }),
          })),
        )
      : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">法要の申し込み</h1>
        <MemorialTabs />
      </div>

      <section className="rounded border border-stone-200 bg-white p-4">
        <h2 className="mb-2 text-xl font-bold">
          {r.householdName} {r.targets.map((t) => t.kaikiName).join("・")}
          {r.targets.length > 1 && <JointBadge />}
        </h2>
        <dl>
          <Row label="状態">
            <RequestStatusBadge status={r.status} />
            {r.declineReason && <div className="mt-1 text-stone-700">理由: {r.declineReason}</div>}
          </Row>
          <Row label="受付">
            {formatJst(r.createdAt)}（{REQUEST_SOURCE_LABELS[r.source]}
            {r.requestedByName ? `、${r.requestedByName}さん` : r.staffName ? `、${r.staffName}` : ""}）
          </Row>
          <Row label="世帯">
            <Link href={`/admin/ledger/households/${r.householdId}`} className="underline">
              {r.householdName}
            </Link>
            {r.householdPhone && <span className="ml-2 text-stone-600">{r.householdPhone}</span>}
          </Row>
          <Row label="故人と回忌">
            <TargetsList targets={r.targets} />
          </Row>
          <Row label="施主">{r.seshuDisplay ?? "—"}</Row>
          <Row label="希望の時期">
            {r.preferredPeriods.length === 0
              ? "—"
              : r.preferredPeriods.map((p, i) => (
                  <div key={i}>
                    第 {i + 1} 希望: {dateLabel(p.from)}〜{dateLabel(p.to)}
                    {p.note && <span className="text-stone-600">（{p.note}）</span>}
                  </div>
                ))}
          </Row>
          <Row label="場所">{LOCATION_LABELS[r.location]}</Row>
          <Row label="参列の人数">{r.attendees ? `${r.attendees} 人` : "—"}</Row>
          <Row label="お斎">{r.otoki === null ? "—" : r.otoki ? "あり" : "なし"}</Row>
          {r.notes && <Row label="連絡事項">{r.notes}</Row>}
          {r.service && (
            <Row label="確定した法要">
              <Link href={`/admin/memorial/services/${r.service.id}`} className="underline">
                {formatJst(r.service.startAt)} {LOCATION_LABELS[r.service.location]}・{r.service.officiantName}
              </Link>
            </Row>
          )}
        </dl>
      </section>

      {r.status === "requested" && (
        <>
          <section className="space-y-3 rounded border border-stone-200 bg-white p-4">
            <h2 className="text-lg font-bold">年忌の検証（第 1 希望の時期で確かめています）</h2>
            {verifications.map(({ target, result }) => (
              <div key={target.personId} className="space-y-1">
                <h3 className="font-medium">
                  {target.name}（{target.kaikiName}）
                </h3>
                <VerifyResultView result={result} />
              </div>
            ))}
          </section>

          <section className="space-y-3 rounded border border-stone-200 bg-white p-4">
            <h2 className="text-lg font-bold">候補の日時を選んで確定する</h2>
            {r.preferredPeriods.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/memorial/requests/${r.id}`} className="rounded-full border border-stone-300 bg-white px-3 py-1">
                  すべての希望
                </Link>
                {r.preferredPeriods.map((_, i) => (
                  <Link key={i} href={`/admin/memorial/requests/${r.id}?p=${i}`} className="rounded-full border border-stone-300 bg-white px-3 py-1">
                    第 {i + 1} 希望だけ
                  </Link>
                ))}
              </div>
            )}
            {periods.length === 0 ? (
              <p className="text-stone-600">希望の時期が過ぎています。檀家さんと相談のうえ、電話で受けた法要として登録してください。</p>
            ) : (
              <BookingSection
                actor={actor}
                householdId={r.householdId}
                periods={periods}
                location={r.location}
                targetPersonIds={r.targets.map((t) => t.personId)}
                travelBefore={intParam(sp.travelBefore)}
                travelAfter={intParam(sp.travelAfter)}
                hidden={[{ name: "memorialRequestId", value: r.id }]}
                keep={typeof sp.p === "string" ? { p: sp.p } : {}}
              />
            )}
          </section>

          <section className="rounded border border-stone-200 bg-white p-4">
            <h2 className="mb-2 text-lg font-bold">お断りする</h2>
            <DeclineForm id={r.id} />
          </section>
        </>
      )}
    </div>
  );
}
