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
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/password/i).fill(password!);
  await page.getByRole("button", { name: /^connexion$/i }).click();

  // Connexion réussie → redirection vers /home.
  await expect(page).toHaveURL(/\/home/, { timeout: 15_000 });

  await page.context().storageState({ path: authFile });
});
