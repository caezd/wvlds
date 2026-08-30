import { test as setup, expect } from "@playwright/test";
import path from "node:path";

// Produit l'état de session authentifié réutilisé par les specs `*.authed.spec.ts`.
// Nécessite un compte de test : définir E2E_EMAIL et E2E_PASSWORD dans l'environnement
// (ex. .env.test.local non commité). Sans ces variables, le setup est ignoré.

const authFile = path.join(__dirname, ".auth/user.json");

setup("authentification", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  setup.skip(
    !email || !password,
    "Définir E2E_EMAIL et E2E_PASSWORD pour activer les tests authentifiés.",
  );

  await page.goto("/auth/login");
  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  // Sélecteur indépendant de la langue : le navigateur de test annonce
  // `en-US`, l'interface se rend donc en anglais et le libellé « Connexion »
  // ne correspond à rien. Le bouton de soumission du formulaire, lui, ne
  // dépend pas de la locale.
  await page.locator('form button[type="submit"]').click();

  // Connexion réussie → redirection vers /w/<id> ou /explore (plus de /home).
  await expect(page).toHaveURL(/\/(w\/|explore)/, { timeout: 15_000 });

  await page.context().storageState({ path: authFile });
});
