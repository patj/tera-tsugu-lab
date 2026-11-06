// 施設予約の管理画面で共通に使う表示（種類の色、状態の印、予約のチップ）
import Link from "next/link";
import { jstTimeString } from "@/domain/core";
import { kindLabel, statusLabel, type Reservation, type ReservationKind } from "@/domain/facility";

/** 種類ごとの色（法要、前撮り、茶会、その他） */
export const KIND_COLORS: Record<ReservationKind, { solid: string; outline: string; dot: string }> = {
  memorial: { solid: "bg-violet-700 text-white", outline: "border-violet-700 text-violet-800", dot: "bg-violet-700" },
  photo: { solid: "bg-rose-600 text-white", outline: "border-rose-600 text-rose-700", dot: "bg-rose-600" },
  tea: { solid: "bg-emerald-700 text-white", outline: "border-emerald-700 text-emerald-800", dot: "bg-emerald-700" },
  other: { solid: "bg-stone-600 text-white", outline: "border-stone-600 text-stone-700", dot: "bg-stone-600" },
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-400",
  confirmed: "bg-sky-100 text-sky-900 border-sky-400",
  rejected: "bg-stone-100 text-stone-600 border-stone-300",
  cancelled: "bg-stone-100 text-stone-500 border-stone-300 line-through",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-sm ${STATUS_STYLES[status] ?? ""}`}>
      {statusLabel(status)}
    </span>
  );
}

export function KindBadge({ kind }: { kind: ReservationKind }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`inline-block h-3 w-3 rounded-full ${KIND_COLORS[kind].dot}`} />
      {kindLabel(kind)}
    </span>
  );
}

/** 凡例（色と、申請中の表し方） */
export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {(Object.keys(KIND_COLORS) as ReservationKind[]).map((k) => (
        <span key={k} className={`rounded px-2 py-0.5 ${KIND_COLORS[k].solid}`}>
          {kindLabel(k)}
        </span>
      ))}
      <span className="rounded border-2 border-dashed border-stone-500 bg-white px-2 py-0.5 text-stone-700">
        申請中（点線）
      </span>
    </div>
  );
}

/** カレンダーに置く予約のチップ。確定は塗りつぶし、申請中は点線の枠 */
export function ReservationChip({
  r,
  showFacility = false,
}: {
  r: Reservation & { partyName?: string | null };
  showFacility?: boolean;
}) {
  const c = KIND_COLORS[r.kind];
  const style = r.status === "pending" ? `border-2 border-dashed bg-white ${c.outline}` : c.solid;
  return (
    <Link
      href={`/admin/facility/${r.id}`}
      className={`block rounded px-1.5 py-0.5 text-sm leading-snug hover:opacity-80 ${style}`}
      title={`${kindLabel(r.kind)}（${statusLabel(r.status)}）${r.title ?? ""}`}
    >
      <span className="font-medium">
        {jstTimeString(r.start)}〜{jstTimeString(r.end)}
      </span>{" "}
      {showFacility && <span>{r.facilityName} </span>}
      {r.status === "pending" && <span className="font-bold">申請中 </span>}
      <span>{r.title ?? (r.partyName ? `${r.partyName} ${kindLabel(r.kind)}` : kindLabel(r.kind))}</span>
    </Link>
  );
}

export function FacilityTabs() {
  return (
    <nav className="flex flex-wrap gap-2 text-base">
      <Link href="/admin/facility" className="rounded border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-50">
        予約の一覧
      </Link>
      <Link href="/admin/facility/calendar" className="rounded border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-50">
        カレンダー
      </Link>
      <Link href="/admin/facility/new" className="rounded bg-stone-800 px-3 py-1.5 text-white hover:bg-stone-700">
        予約を登録する
      </Link>
      <Link href="/reserve" className="rounded px-3 py-1.5 text-stone-600 underline">
        公開ページ（空き状況と申請）
      </Link>
    </nav>
  );
}
