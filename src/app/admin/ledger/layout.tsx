import Link from "next/link";

const TABS = [
  { href: "/admin/ledger", label: "世帯" },
  { href: "/admin/ledger/deceased", label: "過去帳" },
  { href: "/admin/ledger/memorials", label: "年忌を迎える故人" },
];

export default function LedgerLayout({ children }: LayoutProps<"/admin/ledger">) {
  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-2 border-b border-stone-200 pb-3">
        <span className="mr-2 text-lg font-bold">台帳</span>
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="rounded border border-stone-300 bg-white px-3 py-1 hover:bg-stone-50">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
