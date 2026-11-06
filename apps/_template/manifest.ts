// アプリの名前、説明、アイコン、お寺との共有を使うか。
// ひな形: 作るときは id をディレクトリの名前に変える（apps/CLAUDE.md）
import { defineAppManifest } from "@/apps-sdk";

export const manifest = defineAppManifest({
  id: "_template",
  name: "アプリの名前",
  description: "アプリの一覧に出す、1〜2 文の説明。",
  icon: "📝",
  // true にすると、利用者が「お寺と共有する」を選べるようになる（Admin.tsx が必要）
  sharing: true,
});
