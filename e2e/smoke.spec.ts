import { test, expect } from "@playwright/test";

// Tests « smoke » sans authentification : pages publiques + garde des routes protégées.
// Runnable immédiatement avec `pnpm test:e2e` (aucune donnée de test requise).

test.describe("Pages publiques", () => {
  test("la page de connexion s'affiche", async ({ page }) => {
    await page.goto("/auth/login");
    // Sélecteurs indépendants de la langue : le navigateur de test annonce
    // `en-US`, l'interface ne se rend donc pas en français.
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toBeVisible();
  });

  test("le lien d'inscription mène à /auth/sign-up", async ({ page }) => {
    await page.goto("/auth/login");
    await page.locator('a[href="/auth/sign-up"]').first().click();
    await expect(page).toHaveURL(/\/auth\/sign-up/);
  });

  test("la validation HTML empêche la soumission à vide", async ({ page }) => {
    await page.goto("/auth/login");
    await page.locator('form button[type="submit"]').click();
    // On reste sur la page de login (champs required non remplis).
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe("Routes protégées", () => {
  test("un visiteur non connecté est redirigé vers la connexion", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
