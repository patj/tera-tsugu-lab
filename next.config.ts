import type { NextConfig } from "next";

// Cache Components は使わない（DB を読む画面を素直に書けるようにするため。docs/tasks/00-foundation.md）
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      // Tailwind の処理は globals.css だけにかける（*.css にかけると、お寺のアプリの *.module.css も
      // ふつうの CSS として扱われ、CSS Modules にならないため。spec.md §7「見た目」）
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
