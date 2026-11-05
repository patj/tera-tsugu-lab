// シードの共通の型。各機能のシードは、ここで作った ID を名前で受け渡す（例: 台帳のシードが作った山田家を、法要のシードが使う）。
import type { Db } from "../client";
import type { Actor } from "@/domain/core";

export type SeedContext = {
  db: Db;
  templeId: string;
  /** シードの操作者（監査ログなどに使う） */
  actor: Actor;
  /** 名前つきの ID を登録する（例: set("household:yamada", id)） */
  set(key: string, id: string): void;
  /** 名前つきの ID を取り出す。なければエラー */
  get(key: string): string;
  /** 名前つきの ID を取り出す。なければ undefined */
  find(key: string): string | undefined;
};

export type Seed = {
  name: string;
  run(ctx: SeedContext): Promise<void>;
};

export function createSeedContext(db: Db, templeId: string, actor: Actor): SeedContext {
  const ids = new Map<string, string>();
  return {
    db,
    templeId,
    actor,
    set(key, id) {
      if (ids.has(key)) throw new Error(`シードの名前が重複しています: ${key}`);
      ids.set(key, id);
    },
    get(key) {
      const id = ids.get(key);
      if (!id) throw new Error(`シードの名前が見つかりません: ${key}（先に作るシードの順番を確かめてください）`);
      return id;
    },
    find: (key) => ids.get(key),
  };
}
