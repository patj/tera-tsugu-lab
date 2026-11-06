// お寺のアプリのデータに触れてよい操作者かを判定する。spec.md §4、§7
// - MCP（LLM を通る操作）からは一切参照させない
// - 利用者の関数は、お寺のアプリの利用者（appUserActor）だけ
// - スタッフの関数は、管理画面のスタッフ（channel: web）だけ
import type { Actor } from "../core/actor";
import { forbidden } from "../core/errors";

export function assertNotMcp(actor: Actor): void {
  if (actor.channel === "mcp") throw forbidden("お寺のアプリのデータは、MCP からは扱えません");
}

export function assertAppUser(actor: Actor): asserts actor is Actor & { appUserId: string } {
  assertNotMcp(actor);
  if (actor.channel !== "apps" || !actor.appUserId) throw forbidden("お寺のアプリの画面から操作してください");
}

export function assertAppStaff(actor: Actor): asserts actor is Actor & { staffId: string } {
  assertNotMcp(actor);
  if (actor.channel !== "web" || !actor.staffId) throw forbidden("共有された文書は、管理画面のスタッフだけが見られます");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);
