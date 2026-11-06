// アプリの名前、説明、アイコン、使う能力。
// ひな形: 作るときは id をディレクトリの名前に変える（apps/CLAUDE.md の「manifest」）
import { defineAppManifest } from "@/apps-sdk";

export const manifest = defineAppManifest({
  id: "_template",
  name: "アプリの名前",
  description: "アプリの一覧に出す、1〜2 文の説明。",
  icon: "📝",
  // true にすると、利用者が「お寺と共有する」を選べるようになる（Admin.tsx が必要）
  sharing: true,
  // 必要なときだけ書く:
  // display: "fullscreen",   // アプリが画面全体を使う（右上の 48px 四方はあけておく）
  // pwa: { themeColor: "#FBF6EE", backgroundColor: "#FBF6EE", icon: "icon-512.png" }, // ホーム画面に追加したとき（assets/ の 512×512 の PNG）
  // storage: { maxDocs: 5000 }, // 文書の件数の上限（1〜10,000。初期値 1,000）
  // ai: { purpose: "〇〇するため", sends: ["日記の文字"], model: "claude-sonnet-5-5", dailyLimit: 20 }, // AI を使うとき（ai.ts が必要）
});
