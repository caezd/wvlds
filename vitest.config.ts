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
    // Le défaut (5 s) est trop serré ici : la suite lance ~157 fichiers en
    // parallèle et le seul montage de l'environnement jsdom coûte déjà
    // plusieurs secondes par fichier. Sous contention, des tests parfaitement
    // sains dépassaient le seuil — trois d'entre eux ont échoué tour à tour
    // (brouillon du composer, vérification d'âge) puis repassé isolément et en
    // suite complète, sans qu'une ligne de code ne change. Un échec pareil
    // n'apprend rien et coûte une relance.
    //
    // 15 s reste assez court pour attraper un vrai blocage : les tests les plus
    // lents de la suite tournent en 1 à 3 s.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "hooks/**", "components/**", "app/**"],
      exclude: ["**/*.d.ts", "lib/lucideCategories.ts", "components/ui/**"],
    },
  },
});
