// ポータルの画面の部品（スマートフォン向け、大きめの文字）
import Link from "next/link";
import type { ReactNode } from "react";
import { formatJst, jstParts } from "@/domain/core";
import { LOCATION_LABELS, REQUEST_STATUS_LABELS, type MemorialLocation, type MemorialRequestStatus } from "@/domain/portal";

export const inputClass = "mt-2 block w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg";

export function PageTitle({ children, back = "/portal" }: { children: ReactNode; back?: string | null }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back} className="mb-3 inline-block text-base text-stone-600 underline">
          ← {back === "/portal" ? "ホームへ戻る" : "戻る"}
        </Link>
      )}
      <h1 className="text-2xl font-bold leading-snug">{children}</h1>
    </div>
  );
}

export function ErrorBox({ message }: { message?: string | string[] | null }) {
  const m = Array.isArray(message) ? message[0] : message;
  if (!m) return null;
  return (
    <p role="alert" className="mb-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
      {m}
    </p>
  );
}

export function DoneBox({ children }: { children: ReactNode }) {
  return <p className="mb-5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900">{children}</p>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-stone-200 bg-white px-5 py-4 ${className}`}>{children}</section>;
}

const STATUS_STYLE: Record<MemorialRequestStatus, string> = {
  requested: "bg-amber-100 text-amber-900",
  scheduled: "bg-emerald-100 text-emerald-900",
  declined: "bg-stone-200 text-stone-800",
};

export function StatusBadge({ status }: { status: MemorialRequestStatus }) {
  return <span className={`inline-block rounded-full px-3 py-1 text-base font-bold ${STATUS_STYLE[status]}`}>{REQUEST_STATUS_LABELS[status]}</span>;
}

export function locationLabel(l: MemorialLocation | string): string {
  return LOCATION_LABELS[l as MemorialLocation] ?? l;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 「2027 年 3 月 27 日（土）」 */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${y} 年 ${m} 月 ${d} 日（${WEEKDAYS[w]}）`;
}

/** 「2027 年 3 月 27 日（土）午前 10 時」 */
export function dateTimeLabel(at: Date): string {
  const p = jstParts(at);
  const date = formatJst(at).slice(0, 10);
  const ampm = p.hour < 12 ? "午前" : "午後";
  const h = p.hour <= 12 ? p.hour : p.hour - 12;
  return `${dateLabel(date)} ${ampm} ${h} 時${p.minute ? ` ${p.minute} 分` : ""}`;
}

export function periodLabel(p: { from: string; to: string; note?: string }): string {
  const range = p.from === p.to ? dateLabel(p.from) : `${dateLabel(p.from)} 〜 ${dateLabel(p.to)}`;
  return p.note ? `${range}（${p.note}）` : range;
}

/** 権限がないときの案内（家系図、家の法要の予定、申し込み、家族の権限） */
export function Forbidden({ contactName, what = "家系図と家の法要の予定" }: { contactName: string | null; what?: string }) {
  return (
    <main>
      <PageTitle>この画面は使えません</PageTitle>
      <p>
        {what}は、窓口の方と、窓口から許可されたご家族だけが使えます。必要なときは、窓口の
        {contactName ? ` ${contactName} さん` : "方"}にお願いしてください。
      </p>
    </main>
  );
}
