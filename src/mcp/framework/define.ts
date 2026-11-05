// MCP のツールの定義（spec.md §4）。各機能は src/mcp/tools/<機能>.ts で、この関数を使ってツールを定義する。
//
// - 読み取りのツール: defineReadTool。呼ばれるとすぐに結果を返す
// - 書き込みのツール: defineWriteTool。呼ばれると実行せずに、プレビューと confirmation_id を返す。
//   住職が了承すると Claude が confirm_action を呼び、はじめて execute が実行される
import type { z } from "zod";
import type { Actor } from "@/domain/core";

/** ツールの引数（zod のオブジェクトの shape） */
export type ToolInputShape = z.ZodRawShape;
export type ToolArgs<S extends ToolInputShape> = z.infer<z.ZodObject<S>>;

export type ToolContext = {
  /** 操作者（MCP_ACTOR のスタッフ） */
  actor: Actor & { staffId: string };
  now: Date;
};

export type Preview = {
  /** 住職に見せる、何が登録されるかの説明（日本語。複数行でよい） */
  summary: string;
  /** 構造化した内容（Claude が説明に使う） */
  details?: unknown;
};

export type ReadToolDef<S extends ToolInputShape = ToolInputShape> = {
  kind: "read";
  name: string;
  description: string;
  input: S;
  handler: (args: ToolArgs<S>, ctx: ToolContext) => Promise<unknown>;
};

export type WriteToolDef<S extends ToolInputShape = ToolInputShape> = {
  kind: "write";
  name: string;
  description: string;
  input: S;
  /** 実行せずに、何が起きるかを返す。ここで検証のエラーを投げてもよい */
  preview: (args: ToolArgs<S>, ctx: ToolContext) => Promise<Preview>;
  /** confirm_action のときに実行する。プレビューのあとで状況が変わっていることがあるので、ここでも検証する */
  execute: (args: ToolArgs<S>, ctx: ToolContext) => Promise<unknown>;
};

/** どの引数の型のツールでも入る型（ツールの一覧に使う）。引数は実行時に zod で検証する */
export type ToolDef =
  | (Omit<ReadToolDef, "handler"> & { handler: (args: never, ctx: ToolContext) => Promise<unknown> })
  | (Omit<WriteToolDef, "preview" | "execute"> & {
      preview: (args: never, ctx: ToolContext) => Promise<Preview>;
      execute: (args: never, ctx: ToolContext) => Promise<unknown>;
    });

export function defineReadTool<S extends ToolInputShape>(def: Omit<ReadToolDef<S>, "kind">): ReadToolDef<S> {
  return { kind: "read", ...def };
}

export function defineWriteTool<S extends ToolInputShape>(def: Omit<WriteToolDef<S>, "kind">): WriteToolDef<S> {
  return { kind: "write", ...def };
}
