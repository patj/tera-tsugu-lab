// ケアのデータに触れてよい操作者かを判定する。spec.md §4、§7
// - MCP（Claude Desktop など、LLM を通る操作）からは一切参照させない
// - 相談者の関数は、ケアのポータルの操作者（careActor）だけ
// - 管理者の関数は、管理画面のスタッフ（channel: web）だけ
import type { Actor } from "../core/actor";
import { forbidden } from "../core/errors";

export function assertNotMcp(actor: Actor): void {
  if (actor.channel === "mcp") throw forbidden("ケアのデータは、MCP からは扱えません");
}

export function assertCareSubject(actor: Actor): asserts actor is Actor & { careSubjectId: string } {
  assertNotMcp(actor);
  if (actor.channel !== "care" || !actor.careSubjectId) throw forbidden("ケアのポータルから操作してください");
}

export function assertCareStaff(actor: Actor): asserts actor is Actor & { staffId: string } {
  assertNotMcp(actor);
  if (actor.channel !== "web" || !actor.staffId) throw forbidden("ケアの記録は、管理画面のスタッフだけが見られます");
}
