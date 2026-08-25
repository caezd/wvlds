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
    // 15 s plutôt que les 5 s par défaut. Aucun test ici ne mesure une durée :
    // ce délai n'est qu'un garde-fou contre un test réellement bloqué. Les plus
    // lents (ChangelogFilters, WorldWiki) tournent en ~0,5–0,9 s isolés, mais
    // la suite lance un worker jsdom par fichier en parallèle — sous contention
    // (beaucoup de cœurs, serveur de dev à côté) ils franchissaient les 5 s et
    // échouaient sans qu'aucun code ne soit en cause.
    testTimeout: 15000,
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
