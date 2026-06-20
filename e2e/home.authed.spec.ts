import { test, expect } from "@playwright/test";

// Exemple de spec AUTHENTIFIÉE — exécutée par le projet `chromium-auth`,
// qui injecte le storageState produit par auth.setup.ts.
// Ne tourne que si E2E_EMAIL / E2E_PASSWORD sont définis (sinon le setup skip
// et aucun storageState n'est produit).

test.describe("Espace connecté", () => {
  test("accède à /home sans être redirigé vers la connexion", async ({ page }) => {
    await page.goto("/home");
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });

  test("la sidebar des mondes est présente", async ({ page }) => {
    await page.goto("/home");
    // Ajuste ce sélecteur à un repère stable de ta home (ex. bouton « Créer un monde »).
    await expect(
      page.getByRole("button", { name: /créer un monde/i }).or(page.getByText(/mes mondes/i)),
    ).toBeVisible();
  });
});
