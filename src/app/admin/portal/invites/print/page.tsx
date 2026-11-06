// 招待コードの印刷（寺報や手紙に同封する。1 人 1 枚のカード。QR コードは登録の画面の URL）
import Link from "next/link";
import { getTemple, jstDateString } from "@/domain/core";
import { encodeQr, listPortalInvites, qrSvgPath, type InviteStatus } from "@/domain/portal";
import { getStaffActor } from "@/lib/staff-auth";

export const metadata = { title: "招待コードの印刷" };

function Qr({ text }: { text: string }) {
  const { size, path } = qrSvgPath(encodeQr(text));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="size-36 shrink-0" role="img" aria-label="招待コードの QR コード" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

export default async function InvitePrintPage({ searchParams }: PageProps<"/admin/portal/invites/print">) {
  const sp = await searchParams;
  const actor = await getStaffActor();
  const temple = await getTemple(actor.templeId);
  const ids = typeof sp.ids === "string" ? sp.ids.split(",").filter(Boolean) : undefined;
  const status = (["unused", "used", "expired", "all"] as const).includes(sp.status as InviteStatus)
    ? (sp.status as InviteStatus | "all")
    : "unused";
  const invites = await listPortalInvites(actor, {
    ids,
    status: ids ? "all" : status,
    householdId: typeof sp.household === "string" && sp.household ? sp.household : undefined,
  });

  return (
    <div>
      {/* 印刷するときは、管理画面のヘッダーと操作の部品を出さない */}
      <style>{"@media print { body > div > header { display: none !important; } main { padding: 0 !important; max-width: none !important; } }"}</style>
      <div className="mb-6 flex flex-wrap items-center gap-4 print:hidden">
        <Link href="/admin/portal/invites" className="underline">
          ← 招待コードの一覧へ
        </Link>
        <span className="text-stone-600">{invites.length} 枚。ブラウザの印刷（⌘P / Ctrl+P）で印刷してください。</span>
      </div>
      {invites.length === 0 && <p>印刷する招待コードがありません。</p>}
      <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-3">
        {invites.map((i) => (
          <article key={i.id} className="break-inside-avoid rounded-lg border-2 border-dashed border-stone-400 bg-white p-5 text-base">
            <p className="text-sm text-stone-600">{temple.name} 檀家ポータルのご案内</p>
            <p className="mt-1 text-xl font-bold">
              {i.householdName} {i.personName} 様
            </p>
            <div className="mt-3 flex items-center gap-4">
              <Qr text={i.url} />
              <div className="min-w-0">
                <p>スマートフォンで QR コードを読み取るか、下の URL を開いて、招待コードとメールアドレスを入力してください。</p>
                <p className="mt-2 text-sm text-stone-600">招待コード</p>
                <p className="font-mono text-2xl font-bold tracking-widest">{i.displayCode}</p>
              </div>
            </div>
            <p className="mt-3 break-all font-mono text-sm">{i.url.replace(/\?code=.*$/, "")}</p>
            <p className="mt-2 text-sm text-stone-600">
              有効期限: {jstDateString(i.expiresAt)}（1 回だけ使えます）。2 回目からは、メールアドレスでログインできます。
              {i.status !== "unused" && <strong className="ml-2 text-red-700">（{i.status === "used" ? "使用済み" : "期限切れ"}）</strong>}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
