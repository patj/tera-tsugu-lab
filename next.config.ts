import type { NextConfig } from "next";

// Cache Components は使わない（DB を読む画面を素直に書けるようにするため。docs/tasks/00-foundation.md）
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
