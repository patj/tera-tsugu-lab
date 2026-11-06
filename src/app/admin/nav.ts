// 管理画面のナビゲーション。各機能は、ここに 1 行を追記するだけにする（docs/tasks/README.md）。
export type NavItem = { href: string; label: string };

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "ホーム" },
  { href: "/admin/ledger", label: "台帳" },
  { href: "/admin/calendar", label: "カレンダー" },
  { href: "/admin/facility", label: "施設予約" },
];
