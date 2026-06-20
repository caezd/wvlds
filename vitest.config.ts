import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Résout l'alias `@/*` du tsconfig nativement (Vitest 4+).
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    // Les specs Playwright vivent dans e2e/ et ne doivent pas être ramassées par Vitest.
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "hooks/**", "components/**", "app/**"],
      exclude: ["**/*.d.ts", "lib/lucideCategories.ts", "components/ui/**"],
    },
  },
});
