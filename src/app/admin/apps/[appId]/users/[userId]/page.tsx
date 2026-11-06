// 共有された文書（アプリの Admin.tsx に、本体が復号した文書を渡す。読むだけ）。開くたびに監査ログに残る
import Link from "next/link";
import { notFound } from "next/navigation";
import { APP_VIEWS } from "@/apps-sdk/views.generated";
import { isDomainError } from "@/domain/core";
import { findApp, listSharedAppDocuments, type SharedAppDocuments } from "@/domain/apps";
import { getStaffActor } from "@/lib/staff-auth";

export const metadata = { title: "共有されたデータ | お寺のアプリ" };

export default async function AdminAppUserPage({ params }: PageProps<"/admin/apps/[appId]/users/[userId]">) {
  const actor = await getStaffActor();
  const p = await params;
  const appId = decodeURIComponent(p.appId);
  let result: SharedAppDocuments;
  try {
    result = await listSharedAppDocuments(actor, appId, p.userId);
  } catch (e) {
    if (isDomainError(e) && e.code === "not_found") notFound();
    throw e;
  }
  const manifest = findApp(appId)!;
  const Admin = APP_VIEWS[appId]?.Admin;

  return (
    <div className="text-lg">
      <Link href="/admin/apps" className="text-base underline">
        ← お寺のアプリ
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        {result.nickname} さん・{manifest.icon} {manifest.name}
      </h1>
      <p className="mt-1 text-base text-stone-600">
        この画面を開いたことは、監査ログに残ります。
        {result.perDoc && "このアプリは 1 件ずつ共有するアプリです。利用者が選んだものだけを表示します。"}
      </p>
      <div className="mt-6 max-w-3xl">
        {!result.shared ? (
          <p className="rounded border border-stone-300 bg-stone-100 px-4 py-3">この利用者は、このアプリを共有していません（共有をやめた可能性があります）。</p>
        ) : result.perDoc && result.docs.length === 0 ? (
          <p className="rounded border border-stone-300 bg-stone-100 px-4 py-3">この利用者は、まだ共有するものを選んでいません。</p>
        ) : Admin ? (
          <Admin manifest={manifest} docs={result.docs} nickname={result.nickname} />
        ) : (
          <pre className="overflow-x-auto rounded bg-white p-4 text-sm">{JSON.stringify(result.docs, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
