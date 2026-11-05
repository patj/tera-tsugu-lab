import Link from "next/link";
import { getCurrentStaff } from "@/lib/staff-auth";
import { logout } from "../login/actions";
import { ADMIN_NAV } from "./nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const staff = await getCurrentStaff();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="text-lg font-bold">
            てらつぐ
          </Link>
          <nav className="flex flex-1 flex-wrap gap-x-5 gap-y-1">
            {ADMIN_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:underline">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm text-stone-600">
            <span>
              {staff.roleTitle} {staff.name}
            </span>
            <form action={logout}>
              <button type="submit" className="underline">
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
