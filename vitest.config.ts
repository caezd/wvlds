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
    // .claude/** exclut aussi les worktrees d'agents (ex. .claude/worktrees/**), qui
    // contiennent leur propre copie de e2e/ non couverte par le pattern ci-dessus.
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**", ".claude/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "hooks/**", "components/**", "app/**"],
      exclude: ["**/*.d.ts", "lib/lucideCategories.ts", "components/ui/**"],
    },
  },
});
