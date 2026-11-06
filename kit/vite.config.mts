// 試す画面（npm run dev）の設定。アプリからの import "@/apps-sdk" を、キットの sdk/ につなぐ
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@/apps-sdk": fileURLToPath(new URL("./sdk/index.ts", import.meta.url)) },
  },
});
