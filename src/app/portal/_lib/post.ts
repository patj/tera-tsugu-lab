// ポータルの POST（ルートハンドラー）の共通の部品。
// 画面のフォームは <form method="post"> で送る（JavaScript がなくても動く）。JavaScript があれば、
// PortalForm が fetch で送り（Accept: application/json）、エラーをその場で表示する。
// - JSON を求められたら { ok, redirect?, error? } を返す。そうでなければ 303 で移る（エラーは ?error= で戻す）
// - cookie は sameSite=lax なので、ほかのサイトからの POST には付かない。念のため Origin も確かめる
import { NextResponse, type NextRequest } from "next/server";
import { isDomainError, type Actor } from "@/domain/core";
import { getPortalContext, type PortalContext } from "@/domain/portal";
import { findCurrentPortal } from "@/lib/portal-auth";

export function wantsJson(req: NextRequest): boolean {
  return (req.headers.get("accept") ?? "").includes("application/json");
}

/** Origin があれば、同じホストからの送信か確かめる（curl など Origin のない送信は通す） */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host);
  } catch {
    return false;
  }
}

export function ok(req: NextRequest, path: string, extra: Record<string, unknown> = {}): NextResponse {
  if (wantsJson(req)) return NextResponse.json({ ok: true, redirect: path, ...extra });
  return NextResponse.redirect(new URL(path, req.url), 303);
}

export function fail(req: NextRequest, message: string, backPath: string, status = 400): NextResponse {
  if (wantsJson(req)) return NextResponse.json({ ok: false, error: message }, { status });
  const url = new URL(backPath, req.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

const STATUS: Record<string, number> = { invalid: 400, forbidden: 403, not_found: 404, conflict: 409, expired: 410 };

/** ドメイン層のエラーは利用者に見せる。それ以外はログに残して、一般的な案内にする */
export function failFrom(req: NextRequest, e: unknown, backPath: string): NextResponse {
  if (isDomainError(e)) return fail(req, e.message, backPath, STATUS[e.code] ?? 400);
  console.error(e);
  return fail(req, "うまく送れませんでした。時間をおいて、もう一度お試しください。", backPath, 500);
}

export type PortalPostContext = { actor: Actor; ctx: PortalContext; form: FormData };

/**
 * ログインが必要な POST。ログインの状態を cookie から引き直し（画面から来た世帯や本人の ID は使わない）、
 * fn が返したパスへ移る。エラーは backPath に戻す
 */
export async function portalPost(
  req: NextRequest,
  backPath: string,
  fn: (c: PortalPostContext) => Promise<string>,
): Promise<NextResponse> {
  if (!sameOrigin(req)) return fail(req, "このページからは送れません。", backPath, 403);
  const cur = await findCurrentPortal();
  if (!cur) return fail(req, "ログインの期限が切れました。もう一度ログインしてください。", "/portal/login", 401);
  try {
    const ctx = await getPortalContext(cur.actor);
    const form = await req.formData();
    return ok(req, await fn({ actor: cur.actor, ctx, form }));
  } catch (e) {
    return failFrom(req, e, backPath);
  }
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}
