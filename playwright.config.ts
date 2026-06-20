import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
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
