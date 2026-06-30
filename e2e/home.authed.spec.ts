import { test, expect } from "@playwright/test";

// Specs AUTHENTIFIÉES — exécutées par le projet `chromium-auth`,
// qui injecte le storageState produit par auth.setup.ts.
// Ne tourne que si E2E_EMAIL / E2E_PASSWORD sont définis (sinon le setup skip
// et aucun storageState n'est produit).

test.describe("Espace connecté", () => {
  test("/ redirige vers un monde ou /explore sans passer par la connexion", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await expect(page).toHaveURL(/\/(w\/|explore)/);
  });

  test("la sidebar des mondes est présente sur /w", async ({ page }) => {
    await page.goto("/w");
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });
});
