// 記録 1 件の型（zod）。manifest の項目とキーをそろえる（本体が保存の前に検証する）
import { z } from "zod";

export const schema = z.object({
  mood: z.number().int().min(1).max(5),
  note: z.string().max(2000).optional(),
});

export type Entry = z.infer<typeof schema>;
