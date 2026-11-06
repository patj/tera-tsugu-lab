// 法要の受付の管理画面で共通に使う表示（タブ、状態の印、故人の並べ方、検証の結果、候補の日時）
import Link from "next/link";
import { jst, jstParts, jstTimeString } from "@/domain/core";
import {
  JOINT_SERVICE_LABEL,
  requestStatusLabel,
  serviceStatusLabel,
  type FindMemorialSlotsResult,
  type TargetView,
  type VerifyMemorialResult,
} from "@/domain/memorial";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
export const dateLabel = (date: string) => `${date.slice(5).replace("-", "/")}（${WEEKDAYS[jstParts(jst(date)).weekday]}）`;

export const input = "mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2";

export function MemorialTabs() {
  return (
    <nav className="flex flex-wrap gap-2 text-base">
      <Link href="/admin/memorial" className="rounded border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-50">
        法要の一覧
      </Link>
      <Link href="/admin/memorial/requests" className="rounded border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-50">
        申し込み
      </Link>
      <Link href="/admin/memorial/new" className="rounded bg-stone-800 px-3 py-1.5 text-white hover:bg-stone-700">
        電話で受けた法要を登録する
      </Link>
    </nav>
  );
}

const REQUEST_STYLES: Record<string, string> = {
  requested: "bg-amber-100 text-amber-900 border-amber-400",
  scheduled: "bg-sky-100 text-sky-900 border-sky-400",
  declined: "bg-stone-100 text-stone-600 border-stone-300",
};
const SERVICE_STYLES: Record<string, string> = {
  scheduled: "bg-sky-100 text-sky-900 border-sky-400",
  done: "bg-emerald-100 text-emerald-900 border-emerald-400",
  cancelled: "bg-stone-100 text-stone-500 border-stone-300 line-through",
};

export function RequestStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-sm ${REQUEST_STYLES[status] ?? ""}`}>
      {requestStatusLabel(status)}
    </span>
  );
}

export function ServiceStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-sm ${SERVICE_STYLES[status] ?? ""}`}>
      {serviceStatusLabel(status)}
    </span>
  );
}

export function JointBadge() {
  return <span className="ml-1 inline-block rounded bg-violet-100 px-2 py-0.5 text-sm text-violet-900">{JOINT_SERVICE_LABEL}</span>;
}

/** 故人ごとの回忌（「七回忌 山田 太郎（慈光院日太信士）」） */
export function TargetsList({ targets }: { targets: TargetView[] }) {
  return (
    <ul className="space-y-0.5">
      {targets.map((t) => (
        <li key={t.personId}>
          <span className="font-medium">{t.kaikiName}</span> {t.relation && <span className="text-stone-600">{t.relation} </span>}
          {t.name}
          {t.homyo && <span className="text-stone-600">（{t.homyo}）</span>}
        </li>
      ))}
    </ul>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-stone-100 py-2 last:border-0">
      <dt className="text-stone-600">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** 年忌の検証の結果（4 つのチェック） */
export function VerifyResultView({ result }: { result: VerifyMemorialResult }) {
  if (result.status !== "verified") return <p className="text-stone-600">{result.message}</p>;
  const c = result.checks;
  const item = (label: string, ok: boolean, message: string, note?: string) => (
    <li className={`rounded border px-3 py-2 ${ok ? "border-stone-200 bg-white" : "border-amber-400 bg-amber-50"}`}>
      <div className="font-medium">
        {ok ? "✓" : "⚠"} {label}
        {note && <span className="ml-2 text-sm font-normal text-violet-800">{note}</span>}
      </div>
      <div className="text-stone-700">{message}</div>
    </li>
  );
  return (
    <ul className="space-y-2">
      {item("故人の確認", true, c.identity.message)}
      {item("回忌と年", c.kaiki.ok, c.kaiki.message)}
      {item("祥月命日", c.meinichi.ok, c.meinichi.message)}
      {item(JOINT_SERVICE_LABEL, true, c.joint.message, c.joint.candidates.length > 0 ? "提案あり" : undefined)}
    </ul>
  );
}

/** 候補の日時を、日ごとに並べたラジオボタン（value は "YYYY-MM-DD|HH:MM|担当者の ID"） */
export function SlotPicker({ result }: { result: FindMemorialSlotsResult }) {
  if (result.slots.length === 0) return <p className="text-stone-600">この期間に候補はありません。期間や場所、担当者を変えてください。</p>;
  const byDate = new Map<string, FindMemorialSlotsResult["slots"]>();
  for (const s of result.slots) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  return (
    <div className="space-y-2">
      {result.truncated && <p className="text-amber-800">候補が多いので、先頭の {result.slots.length} 件だけを並べています。</p>}
      <div className="max-h-[32rem] space-y-1 overflow-y-auto rounded border border-stone-200 bg-white p-2">
        {[...byDate.entries()].map(([date, slots]) => (
          <div key={date} className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-stone-100 py-1.5 last:border-0">
            <div className="w-28 shrink-0 font-medium">
              {dateLabel(date)}
              {slots[0].beforeMeinichi === false && <div className="text-xs font-normal text-amber-800">命日より後</div>}
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              {slots.flatMap((s) =>
                s.officiants.map((o) => (
                  <label
                    key={`${s.date}-${jstTimeString(s.start)}-${o.id}`}
                    className="flex cursor-pointer items-center gap-1.5 rounded border border-stone-300 px-2 py-1 has-[:checked]:border-stone-800 has-[:checked]:bg-stone-800 has-[:checked]:text-white"
                  >
                    <input type="radio" name="slot" value={`${s.date}|${jstTimeString(s.start)}|${o.id}`} required className="sr-only" />
                    <span className="font-medium">{jstTimeString(s.start)}</span>
                    <span className="text-sm">{o.roleTitle}</span>
                  </label>
                )),
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-stone-600">
        {result.location === "temple"
          ? `本堂と担当者を、法要 ${result.durationMin} 分＋前後の準備と片付け ${result.bufferMin} 分ずつで押さえます。`
          : `担当者を、行き ${result.travelBeforeMin} 分＋法要 ${result.durationMin} 分＋帰り ${result.travelAfterMin} 分で押さえます（本堂は押さえません）。`}
        祥月命日より前の日を先に並べています。
      </p>
    </div>
  );
}
