// 文書の読み書きの API（/apps/api/<app-id>/docs）の共通の部品。useAppStorage（src/apps-sdk/storage.tsx）が呼ぶ。
// - 利用者は cookie（tera_apps）で決める。URL や本文から利用者を受け取らない
// - 同じオリジンからの JSON だけを受け付ける（ほかのサイトのフォームからは送れない）
// - エラーは、ドメイン層のメッセージだけを返す。本文をログに出さない
import { NextResponse, type NextRequest } from "next/server";
import { isDomainError, type Actor } from "@/domain/core";
import { findAppSession } from "@/lib/apps-auth";

const STATUS: Record<string, number> = { invalid: 400, forbidden: 403, not_found: 404, conflict: 409, expired: 410 };

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.method === "GET";
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host);
  } catch {
    return false;
  }
}

export async function handle(req: NextRequest, fn: (actor: Actor) => Promise<unknown>): Promise<NextResponse> {
  if (!sameOrigin(req)) return NextResponse.json({ error: "このページからは送れません" }, { status: 403 });
  if (req.method !== "GET" && req.method !== "DELETE" && !(req.headers.get("content-type") ?? "").includes("application/json")) {
    return NextResponse.json({ error: "JSON で送ってください" }, { status: 415 });
  }
  const session = await findAppSession();
  if (!session) return NextResponse.json({ error: "はじめの画面から、もう一度始めてください" }, { status: 401 });
  try {
    return NextResponse.json((await fn(session.actor)) ?? { ok: true });
  } catch (e) {
    if (isDomainError(e)) return NextResponse.json({ error: e.message }, { status: STATUS[e.code] ?? 400 });
    console.error(`apps: API の処理に失敗しました（${e instanceof Error ? e.name : typeof e}）`);
    return NextResponse.json({ error: "うまく保存できませんでした。時間をおいて、もう一度お試しください。" }, { status: 500 });
  }
}

/** 本文の JSON から data を取り出す（{ data: ... }） */
export async function readData(req: NextRequest): Promise<unknown> {
  const body = (await req.json().catch(() => null)) as { data?: unknown } | null;
  return body?.data;
}
