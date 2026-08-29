import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Les identifiants du compte de test vivent dans `.env.local` (non commité),
// comme le reste de la configuration locale. Playwright ne lit pas ce fichier
// de lui-même : sans ce chargement, E2E_EMAIL/E2E_PASSWORD sont absents et
// tous les tests authentifiés sont silencieusement ignorés — on croit alors
// avoir une suite verte alors qu'elle n'a rien vérifié.
loadEnv({ path: ".env.local", quiet: true });

const PORT = 3000;
// Quand cette variable est absente, Playwright démarre lui-même `next dev`.
const serveurDeDeveloppement = !process.env.E2E_BASE_URL;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Config Playwright (tests E2E). Les specs vivent dans `e2e/`.
 * - `pnpm test:e2e` lance le serveur Next dev automatiquement (webServer ci-dessous).
 * - Les tests authentifiés réutilisent un `storageState` produit par `e2e/auth.setup.ts`
 *   (voir e2e/README.md). Ils sont SKIP tant que E2E_EMAIL / E2E_PASSWORD ne sont pas définis.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Un seul worker face à `next dev`, plusieurs face à un serveur bâti.
  //
  // `next dev` compile à la demande, dans un seul processus. Deux workers qui
  // ouvrent des pages différentes en même temps le mettent en défaut : des
  // routes prises au hasard répondent 500 — avec, curieusement, un corps
  // complet et correctement rendu. La route fautive change à chaque exécution.
  //
  // Mesuré le 2026-08-28, trois exécutions par cas :
  //   dev,        parallèle   → 1 à 2 routes en 500, jamais les mêmes
  //   dev,        1 worker    → 25/25, en 1 min 30
  //   production, parallèle   → 25/25, en 21 s
  //
  // C'est donc un artefact du serveur de développement, pas un défaut de
  // l'application. Une suite de fumée qui échoue au hasard ne vaut rien : on
  // sérialise là où c'est nécessaire, et on garde le parallélisme quand la
  // cible est un serveur bâti (`E2E_BASE_URL`), où il est à la fois sûr et
  // quatre fois plus rapide.
  workers: serveurDeDeveloppement ? 1 : undefined,
  // Même raison, autre symptôme : `next dev` compile chaque route au premier
  // accès, et la limite de 30 s par défaut suffit largement à un spec lancé
  // seul mais pas au sein de la suite complète, où le serveur compile déjà
  // autre chose. Un `page.goto` sur « / » a ainsi dépassé les 30 s, puis passé
  // en 8 s isolément. Contre un serveur bâti, rien à compiler : on garde le
  // défaut, qui reste un vrai garde-fou contre un blocage.
  timeout: serveurDeDeveloppement ? 90_000 : 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // Produit l'état de session authentifié (gated par env vars).
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Les specs authentifiées ont leur propre projet, avec le
      // storageState. Ici elles tourneraient sans session et
      // échoueraient toutes sur la redirection vers la connexion.
      testIgnore: /.*\.authed\.spec\.ts/,
    },
    {
      name: "chromium-auth",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
      testMatch: /.*\.authed\.spec\.ts/,
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
