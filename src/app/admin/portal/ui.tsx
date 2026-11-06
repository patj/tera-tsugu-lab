// ポータルの管理画面で共通に使う部品
import Link from "next/link";
import { formatJst } from "@/domain/core";
import { INVITE_STATUS_LABELS, type InviteStatus } from "@/domain/portal";

export function PortalTabs({ current }: { current: "accounts" | "invites" }) {
  const tabs = [
    { key: "accounts", href: "/admin/portal", label: "アカウント" },
    { key: "invites", href: "/admin/portal/invites", label: "招待コード" },
  ];
  return (
    <nav className="mt-4 flex flex-wrap gap-2 border-b border-stone-200 print:hidden">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-t px-4 py-2 ${t.key === current ? "border border-b-0 border-stone-200 bg-white font-bold" : "hover:underline"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Banner({ error, message }: { error?: string | string[]; message?: string | null }) {
  if (typeof error === "string" && error) {
    return <p className="my-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">{error}</p>;
  }
  if (message) return <p className="my-4 rounded border border-green-300 bg-green-50 px-4 py-3 text-green-900">{message}</p>;
  return null;
}

const INVITE_STYLE: Record<InviteStatus, string> = {
  unused: "bg-green-100 text-green-900",
  used: "bg-stone-200 text-stone-800",
  expired: "bg-red-100 text-red-900",
};

export function InviteBadge({ status }: { status: InviteStatus }) {
  return <span className={`rounded px-2 py-0.5 text-sm font-medium ${INVITE_STYLE[status]}`}>{INVITE_STATUS_LABELS[status]}</span>;
}

export function at(d: Date | null): string {
  return d ? formatJst(d) : "—";
}

export function OnOff({ on }: { on: boolean }) {
  return <span className={on ? "font-bold text-green-800" : "text-stone-500"}>{on ? "オン" : "オフ"}</span>;
}
