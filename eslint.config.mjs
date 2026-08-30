import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      ".claude/worktrees/**",
      "public/sw.js",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Les tests remplacent next/image et les Avatar par de simples <img> mockés.
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}", "vitest.setup.ts"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default eslintConfig;
