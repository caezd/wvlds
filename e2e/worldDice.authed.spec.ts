import { test, expect, type Page } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────────
// Les dés d'un monde (migration 270), de bout en bout : la page Jeu › Dés,
// le tirage par la base (`roll_dice`), le message qui désigne le lancer.
//
// Le compte de test possède « Monde E2E ». On y crée un d20, on le masque et
// on le retrouve au rechargement, on passe le monde en « dés du monde
// seulement », puis on lance ce d20 dans un salon du monde. Le `finally`
// remet le monde en formules libres et supprime le dé et le message, même
// quand une étape échoue.
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
  return new URL(page.url()).pathname;
}

async function ouvrirDes(page: Page, chemin: string) {
  await page.goto(`${chemin}?view=settings&section=dice`);
  await expect(page.getByRole("region", { name: "Dés du monde" })).toBeVisible({ timeout: 20_000 });
  // La liste arrive par une action serveur : la lire avant serait la trouver vide.
  await expect(page.locator('[data-testid="world-dice-list"][data-ready]')).toBeAttached({ timeout: 20_000 });
}

/**
 * Fait un geste qui s'enregistre de lui-même, et attend la réponse de l'action
 * serveur. Le toast « Enregistré » ne suffit pas : il garde le même id d'un
 * enregistrement à l'autre et peut encore être affiché par le précédent.
 */
async function enregistrer(page: Page, geste: () => Promise<void>) {
  const reponse = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined,
    { timeout: 20_000 },
  );
  await geste();
  await reponse;
}

/** Les champs « Nom du dé n » : l'indice du dé qui porte ce nom, ou -1. */
async function indiceDe(page: Page, nom: string) {
  const noms = await page.getByRole("textbox", { name: /^Nom du dé \d+$/ }).evaluateAll((els) =>
    els.map((e) => (e as HTMLInputElement).value),
  );
  return noms.indexOf(nom);
}

async function choisirMode(page: Page, libelle: RegExp) {
  const carte = page.getByRole("radio", { name: libelle });
  if ((await carte.getAttribute("aria-checked")) !== "true") {
    await enregistrer(page, () => carte.click());
  }
  await expect(carte).toHaveAttribute("aria-checked", "true");
}

test("Dés du monde : créer, masquer, imposer, lancer par la base", async ({ page }) => {
  // Réglages, rechargement, salon, nettoyage : long sous `next dev`, qui compile à la demande.
  test.setTimeout(240_000);
  const nom = `E2E d20 ${Date.now()}`;
  const etiquette = `E2E lancer ${Date.now()}`;
  const chemin = await ouvrirMonde(page);
  await ouvrirDes(page, chemin);
  let salon: string | null = null;
  try {
    // Un d20, d'un geste, puis renommé : l'enregistrement est automatique.
    await page.getByRole("button", { name: "Nouveau dé" }).first().click();
    await enregistrer(page, () =>
      page.getByRole("dialog", { name: "Nouveau dé" }).getByRole("button", { name: "d20", exact: true }).click(),
    );
    const champs = page.getByRole("textbox", { name: /^Nom du dé \d+$/ });
    const champ = champs.last();
    await expect(champ).toHaveValue("d20");
    await champ.fill(nom);
    await enregistrer(page, () => champ.blur());
    await enregistrer(page, () => page.getByRole("button", { name: `Masquer ${nom}` }).click());
    await expect(page.getByRole("button", { name: `Masquer ${nom}` })).toHaveAttribute("aria-pressed", "true");

    // Les dés du monde seulement.
    await choisirMode(page, /Dés du monde seulement/);

    // Tout est en base : le rechargement rend le même dé, masqué, et le même mode.
    await ouvrirDes(page, chemin);
    expect(await indiceDe(page, nom)).toBeGreaterThanOrEqual(0);
    await expect(page.getByRole("button", { name: `Masquer ${nom}` })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("radio", { name: /Dés du monde seulement/ })).toHaveAttribute("aria-checked", "true");

    // Un salon du monde : pas de formule libre, le dé masqué proposé à l'équipe.
    await page.goto(chemin);
    const lien = page.locator('a[href^="/c/"]').first();
    await expect(lien, `« ${MONDE} » n'a aucun salon`).toBeAttached({ timeout: 20_000 });
    salon = await lien.getAttribute("href");
    await page.goto(salon!);
    await page.getByRole("button", { name: "Insérer un bloc" }).first().click();
    await page.getByRole("button", { name: /^Lancer un dé/ }).first().click();
    const fenetre = page.getByRole("dialog", { name: "Lancer un dé" });
    await expect(fenetre.getByRole("textbox", { name: "Formule" })).toHaveCount(0);
    await fenetre.getByRole("radio", { name: `${nom} (masqué)` }).click();
    await fenetre.getByRole("textbox", { name: "Étiquette (optionnel)" }).fill(etiquette);
    await fenetre.getByRole("button", { name: "Lancer" }).click();

    // Le message montre le lancer de la base, sans marque « Non vérifié ».
    const message = page.locator("[data-message-id]").filter({ hasText: etiquette }).last();
    await expect(message).toContainText(nom, { timeout: 20_000 });
    await expect(message).not.toContainText("Non vérifié");
    // Un lancer ne se modifie pas : le monde ne le permet pas.
    await message.hover();
    await expect(message.getByRole("button", { name: "Modifier la description" })).toHaveCount(0);
  } finally {
    if (salon) {
      if (!page.url().includes(salon)) await page.goto(salon);
      const message = page.locator("[data-message-id]").filter({ hasText: etiquette });
      for (let i = await message.count(); i > 0; i--) {
        const m = message.last();
        await m.hover();
        await m.getByRole("button", { name: "Supprimer le bloc" }).click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
        await expect(message).toHaveCount(i - 1);
      }
    }
    await ouvrirDes(page, chemin);
    await choisirMode(page, /Formules libres/);
    if ((await indiceDe(page, nom)) >= 0) {
      await page.getByRole("button", { name: `Supprimer ${nom}` }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
      await expect.poll(() => indiceDe(page, nom)).toBe(-1);
    }
  }
});
