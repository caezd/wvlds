import { test, expect } from "@playwright/test";

// Tests « smoke » sans authentification : pages publiques + garde des routes protégées.
// Runnable immédiatement avec `pnpm test:e2e` (aucune donnée de test requise).

test.describe("Pages publiques", () => {
  test("la page de connexion s'affiche", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByRole("heading", { name: /connexion/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("le lien d'inscription mène à /auth/sign-up", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("link", { name: /inscrivez-vous/i }).click();
    await expect(page).toHaveURL(/\/auth\/sign-up/);
  });

  test("la validation HTML empêche la soumission à vide", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("button", { name: /^connexion$/i }).click();
    // On reste sur la page de login (champs required non remplis).
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe("Routes protégées", () => {
  test("un visiteur non connecté est redirigé vers la connexion", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
