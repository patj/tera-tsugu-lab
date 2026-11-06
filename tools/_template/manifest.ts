// ツールの名前、説明、アイコン、項目の定義。ひな形: 作るときは id をディレクトリの名前に変える（tools/CLAUDE.md）
import { defineCareManifest } from "@/care-sdk";

export const manifest = defineCareManifest({
  id: "_template",
  name: "ツールの名前",
  description: "ツールの一覧に出す、1〜2 文の説明。",
  icon: "📝",
  fields: [
    {
      id: "mood",
      type: "scale",
      label: "今の気持ち",
      min: 1,
      max: 5,
      labels: { 1: "とてもつらい", 3: "ふつう", 5: "とてもよい" },
      required: true,
    },
    {
      id: "note",
      type: "textarea",
      label: "自由に書いてください",
      maxLength: 2000,
    },
  ],
});
