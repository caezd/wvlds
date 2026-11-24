import { test, expect, type Page } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────────
// L'onglet « Groupes » des réglages d'un monde (migration 232), de bout en
// bout : la base (RLS `relations.manage`, triggers de l'arbre) et l'écran.
//
// Le compte de test possède « Monde E2E » : on y crée un groupe et un
// sous-groupe, on coupe la couleur du sous-groupe, puis on supprime tout. Le
// `finally` nettoie même quand une étape échoue, pour ne pas laisser de
// groupe derrière soi.
// ──────────────────────────────────────────────────────────────────────────

const MONDE = "Monde E2E";
const GROUPE = `E2E groupe ${Date.now()}`;
const SOUS_GROUPE = `${GROUPE} — sous`;

/** La section « Groupes » du menu des paramètres. */
function sectionGroupes(page: Page) {
  return page.getByRole("navigation", { name: "Sections des paramètres" }).getByRole("button", { name: "Groupes", exact: true });
}

async function ouvrirOngletGroupes(page: Page) {
  // Les noms accessibles ci-dessous sont ceux du français ; la langue du
  // compte de test, elle, peut changer.
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "fr", url: test.info().project.use.baseURL! }]);

  // `/` ouvre le dernier monde visité : on passe par le sélecteur de mondes
  // si ce n'est pas déjà « Monde E2E ».
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
  await page.goto(`${new URL(page.url()).pathname}?view=settings`);
  await sectionGroupes(page).click();
  await expect(page.getByRole("region", { name: "Groupes de personas" })).toBeVisible({ timeout: 20_000 });
}

async function supprimer(page: Page, nom: string) {
  const bouton = page.getByRole("button", { name: `Actions du groupe ${nom}`, exact: true });
  if (!(await bouton.count())) return;
  await bouton.click();
  await page.getByRole("menuitem", { name: "Supprimer le groupe", exact: true }).click();
  await expect(page.getByRole("button", { name: `Actions du groupe ${nom}`, exact: true })).toHaveCount(0);
}

test("Groupes : créer un groupe et un sous-groupe, couper sa couleur, et les retrouver au rechargement", async ({ page }) => {
  await ouvrirOngletGroupes(page);
  try {
    // Un groupe à la racine.
    await page.getByRole("textbox", { name: "Nom du groupe…" }).fill(GROUPE);
    await page.getByRole("button", { name: "Ajouter ce groupe" }).click();
    await expect(page.getByRole("button", { name: `Actions du groupe ${GROUPE}`, exact: true })).toBeVisible();

    // Un sous-groupe, depuis le menu de la ligne.
    await page.getByRole("button", { name: `Actions du groupe ${GROUPE}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Ajouter un sous-groupe" }).click();
    await page.getByRole("textbox", { name: "Nom du sous-groupe…" }).fill(SOUS_GROUPE);
    await page.getByRole("button", { name: `Ajouter ce sous-groupe à ${GROUPE}` }).click();
    // La ligne du sous-groupe : celle qui porte son interrupteur.
    const ligne = page.getByRole("switch", { name: `Appliquer la couleur de ${SOUS_GROUPE}` }).locator("xpath=ancestor::li[1]");
    await expect(ligne).toHaveAttribute("data-depth", "1");
    await expect(ligne.locator("[data-inherited]")).toHaveCount(1);

    // Couper sa couleur.
    const bascule = page.getByRole("switch", { name: `Appliquer la couleur de ${SOUS_GROUPE}` });
    await expect(bascule).toHaveAttribute("data-state", "checked");
    await bascule.click();
    await expect(bascule).toHaveAttribute("data-state", "unchecked");

    // Tout est en base : le rechargement rend le même arbre.
    await page.reload();
    await sectionGroupes(page).click();
    await expect(ligne).toHaveAttribute("data-depth", "1");
    await expect(page.getByRole("switch", { name: `Appliquer la couleur de ${SOUS_GROUPE}` })).toHaveAttribute("data-state", "unchecked");

    // Supprimer le parent : le sous-groupe remonte à la racine.
    await supprimer(page, GROUPE);
    await expect(ligne).toHaveAttribute("data-depth", "0");
  } finally {
    await supprimer(page, SOUS_GROUPE);
    await supprimer(page, GROUPE);
  }
});

test("Fiche d'un groupe : description, ajout d'un persona, groupe principal, retrouvés au rechargement", async ({ page }) => {
  const nom = `E2E fiche ${Date.now()}`;
  await ouvrirOngletGroupes(page);
  try {
    await page.getByRole("textbox", { name: "Nom du groupe…" }).fill(nom);
    await page.getByRole("button", { name: "Ajouter ce groupe" }).click();
    const ouvrir = page.getByRole("button", { name: `Gérer le groupe ${nom}`, exact: true });
    await expect(ouvrir).toHaveText(/Aucun membre/);
    await ouvrir.click();
    await expect(page.getByRole("heading", { level: 3, name: nom })).toBeVisible();

    // La description s'enregistre en quittant le champ.
    const description = page.getByRole("textbox", { name: "Description" });
    await description.fill("Groupe de test E2E");
    await description.blur();

    // Le premier persona proposé rejoint le groupe ; un premier groupe ne
    // devient pas forcément son principal (il peut en avoir déjà un).
    const choix = page.getByRole("list", { name: "Ajouter des personas" }).getByRole("button");
    test.skip((await choix.count()) === 0, "« Monde E2E » n'a aucun persona à ajouter");
    const persona = ((await choix.first().locator("span.truncate").first().textContent()) ?? "").trim();
    await choix.first().click();
    await page.getByRole("button", { name: "Ajouter 1 persona" }).click();
    const membres = page.getByRole("list", { name: "Membres" });
    await expect(membres.getByText(persona, { exact: true })).toBeVisible();

    // En faire son groupe principal, s'il ne l'est pas déjà.
    const principal = page.getByRole("button", { name: `En faire le groupe principal de ${persona}` });
    if (await principal.count()) await principal.click();
    await expect(membres.getByText("Principal")).toBeVisible();

    // Tout est en base : le rechargement rend le même groupe.
    await page.reload();
    await sectionGroupes(page).click();
    await expect(page.getByRole("button", { name: `Gérer le groupe ${nom}`, exact: true })).toHaveText(/1 membre/);
    await expect(page.getByRole("button", { name: `Actions du groupe ${nom}`, exact: true }).locator("xpath=ancestor::li[1]"))
      .toContainText("Groupe de test E2E");
  } finally {
    // Supprimer le groupe emporte ses affectations ; le persona retrouve son ancien principal.
    await supprimer(page, nom);
  }
});
