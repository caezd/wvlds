import { test, expect, type Page } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────────
// Le temps d'un salon (migration 275), de bout en bout : réglé dans « Nouveau
// jeu », affiché au-dessus du synopsis, avancé par une ellipse que la base
// pose (`post_chatroom_ellipse`), retrouvé au rechargement et dans les
// réglages. Le salon est créé pour l'occasion ; le `finally` le supprime,
// même quand une étape échoue.
// ──────────────────────────────────────────────────────────────────────────

const MONDE = "Monde E2E";

async function ouvrirMonde(page: Page) {
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "fr", url: test.info().project.use.baseURL! }]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/w\//, { timeout: 20_000 });
  const selecteur = page.getByRole("button", { name: /Changer de monde/ });
  if (!((await selecteur.textContent()) ?? "").includes(MONDE)) {
    await selecteur.click();
    const choix = page.getByTestId("world-picker-item").filter({ hasText: MONDE }).first();
    await expect(choix, `le compte de test n'a pas accès à « ${MONDE} »`).toBeVisible();
    await choix.click();
    await expect(selecteur).toContainText(MONDE, { timeout: 20_000 });
  }
}

/** Le temps affiché en tête du fil, au-dessus du synopsis. */
const tempsDuSalon = (page: Page) =>
  page.getByRole("region", { name: "Synopsis" }).getByRole("group", { name: "Temps du salon" });

test("Temps du salon : réglé à la création, avancé par une ellipse", async ({ page }) => {
  // Création, ellipse, rechargement, réglages, suppression : long sous `next dev`.
  test.setTimeout(240_000);
  const titre = `E2E temps ${Date.now()}`;
  await ouvrirMonde(page);
  let salon: string | null = null;
  try {
    // « Nouveau jeu » : le temps s'active d'un interrupteur, sous la pluie.
    await page.getByText(/Nouveau jeu…/).first().click();
    const formulaire = page.getByRole("dialog", { name: "Nouveau jeu" });
    await formulaire.getByRole("textbox", { name: "Titre" }).fill(titre);
    await formulaire.getByRole("switch", { name: "Régler le temps du salon" }).click();
    await formulaire.getByRole("radio", { name: "Pluie" }).click();
    await formulaire.getByRole("button", { name: "Créer" }).click();
    await expect(page).toHaveURL(/\/c\//, { timeout: 30_000 });
    salon = new URL(page.url()).pathname;

    // Au-dessus du synopsis : la pluie, sans jour passé.
    await expect(tempsDuSalon(page).getByTestId("day-icon")).toHaveAttribute("aria-label", "Pluie", { timeout: 20_000 });
    await expect(tempsDuSalon(page).getByTestId("day-dash")).toHaveCount(0);

    // Un salon neuf : aucun persona n'y est présélectionné.
    await page.getByRole("button", { name: "Insérer un bloc" }).first().waitFor();
    const choisir = page.getByRole("button", { name: "Choisir un persona", exact: true });
    if (await choisir.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
      await choisir.click();
      const picker = page.getByRole("dialog", { name: "Choisir un persona" });
      await picker.locator("button[aria-pressed]:not([disabled])").first().click();
      await picker.getByRole("button", { name: "Confirmer" }).click();
      await expect(picker).toBeHidden();
    }

    // L'ellipse : trois jours plus tard, une nuit claire.
    await page.getByRole("button", { name: "Insérer un bloc" }).first().click();
    await page.getByRole("button", { name: /^Ellipse/ }).first().click();
    const fenetre = page.getByRole("dialog", { name: "Ellipse" });
    await fenetre.getByRole("radio", { name: "Nuit claire" }).click();
    await fenetre.getByRole("spinbutton", { name: "Jours passés" }).fill("3");
    await fenetre.getByRole("button", { name: "Poster l’ellipse" }).click();

    // Le message lit le saut posé par la base.
    const ellipse = page.getByRole("article", { name: "Ellipse" });
    await expect(ellipse).toContainText("3 jours plus tard", { timeout: 20_000 });
    await expect(ellipse.getByTestId("day-from")).toHaveAttribute("aria-label", "Pluie");
    await expect(ellipse.getByTestId("day-icon")).toHaveAttribute("aria-label", "Nuit claire");
    await expect(ellipse.getByTestId("day-dash")).toHaveCount(3);

    // L'en-tête suit, sans rechargement, puis après.
    await expect(tempsDuSalon(page).getByTestId("day-icon")).toHaveAttribute("aria-label", "Nuit claire", { timeout: 20_000 });
    await expect(tempsDuSalon(page).getByTestId("day-dash")).toHaveCount(3);
    await page.reload();
    await expect(tempsDuSalon(page).getByTestId("day-icon")).toHaveAttribute("aria-label", "Nuit claire", { timeout: 20_000 });
    await expect(tempsDuSalon(page).getByTestId("day-from")).toHaveAttribute("aria-label", "Pluie");
    await expect(page.getByRole("article", { name: "Ellipse" })).toContainText("3 jours plus tard");

    // Les réglages du salon le retrouvent.
    await page.getByRole("button", { name: "Paramètres" }).first().click();
    await expect(page.getByRole("switch", { name: "Régler le temps du salon" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Nuit claire" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
  } finally {
    if (salon) {
      if (!page.url().includes(salon)) await page.goto(salon);
      await page.getByRole("button", { name: "Paramètres" }).first().click();
      await page.getByRole("button", { name: "Supprimer la salle" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
      await expect(page).not.toHaveURL(new RegExp(salon), { timeout: 20_000 });
    }
  }
});
