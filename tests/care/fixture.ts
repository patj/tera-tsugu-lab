// ケアのテストで使う、テスト用のツール（tools/ には置かない。setCareToolsForTesting で差し込む）
import { z } from "zod";
import { defineCareManifest, type CareToolDefinition } from "@/care-sdk";

export const TEST_TOOL_ID = "test-diary";

export const testManifest = defineCareManifest({
  id: TEST_TOOL_ID,
  name: "テストの日記",
  description: "テスト用",
  icon: "📝",
  fields: [
    { id: "mood", type: "scale", label: "気分", min: 1, max: 5, required: true },
    {
      id: "feeling",
      type: "choice",
      label: "いまの感じ",
      crisis: true,
      options: [
        { value: "calm", label: "おだやか" },
        { value: "gone", label: "消えてしまいたい" },
      ],
    },
    {
      id: "weather",
      type: "choice",
      label: "天気",
      options: [
        { value: "sunny", label: "晴れ" },
        { value: "die", label: "死にたいほど暑い" },
      ],
    },
    { id: "note", type: "textarea", label: "ひとこと", maxLength: 100 },
  ],
});

export const testSchema = z.object({
  mood: z.number().int().min(1).max(5),
  feeling: z.enum(["calm", "gone"]).optional(),
  weather: z.enum(["sunny", "die"]).optional(),
  note: z.string().max(100).optional(),
});

export const TEST_TOOLS: CareToolDefinition[] = [{ manifest: testManifest, schema: testSchema }];
