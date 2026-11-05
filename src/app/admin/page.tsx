import Link from "next/link";
import { getTemple } from "@/domain/core";
import { getCurrentStaff } from "@/lib/staff-auth";
import { ADMIN_NAV } from "./nav";

export default async function AdminHome() {
  const staff = await getCurrentStaff();
  const temple = await getTemple(staff.templeId);
  return (
    <div>
      <h1 className="text-2xl font-bold">{temple.name}</h1>
      <p className="mt-1 text-stone-600">
        {staff.roleTitle} {staff.name} さん、こんにちは。
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_NAV.filter((item) => item.href !== "/admin").map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded border border-stone-200 bg-white px-4 py-4 text-lg hover:bg-stone-50"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
