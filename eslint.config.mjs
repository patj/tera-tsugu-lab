import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code の worktree（並列の実装）
    ".claude/**",
    // お寺に渡す開発キット（別の package。npm run kit:build で dist/ に組み立てる）
    "kit/**",
    "dist/**",
  ]),
]);

export default eslintConfig;
