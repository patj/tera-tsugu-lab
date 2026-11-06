// 試す画面（npm run dev）の設定。このファイルは変えなくてよい
// - アプリからの import "@/apps-sdk" を、キットの sdk/ につなぐ
// - /__kit/ai/<app-id>/<仕事>: AI の仕事を実行する（preview/ai-middleware.ts。キーは .env の ANTHROPIC_API_KEY で、ブラウザには渡さない）
// - /apps/<app-id>/assets/: 素材をそのまま配信する（Vite の機能）
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

function kitAiPlugin(apiKey: string | undefined): Plugin {
  return {
    name: "temple-app-kit-ai",
    configureServer(server) {
      server.middlewares.use("/__kit/ai/", (req, res) => {
        // サーバーの中だけで読み込む（ブラウザには送らない）
        server
          .ssrLoadModule("/preview/ai-middleware.ts")
          .then((m) => m.handleAiRequest(req, res, (url: string) => server.ssrLoadModule(url), apiKey))
          .catch(() => {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, kind: "unavailable", message: "試す画面のサーバーで AI を呼べませんでした" }));
          });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // VITE_ の付かない変数はブラウザに渡らない。キーはサーバーの中だけで使う
  const env = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "");
  return {
    plugins: [react(), tailwindcss(), kitAiPlugin(env.ANTHROPIC_API_KEY || undefined)],
    resolve: {
      alias: [{ find: /^@\/apps-sdk$/, replacement: fileURLToPath(new URL("./sdk/index.ts", import.meta.url)) }],
    },
  };
});
