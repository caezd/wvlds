import { test, expect, type Page } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────────
// L'onglet « Groupes » des réglages d'un monde (migration 232), de bout en
// bout : la base (RLS `relations.manage`, triggers de l'arbre) et l'écran.
//
// Le compte de test possède « Monde E2E » : on y crée un groupe et un
// sous-groupe sur leur page, on coupe la couleur du sous-groupe, puis on
// supprime tout depuis la liste. Le
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

/** La ligne d'un groupe dans la liste. */
function ligne(page: Page, nom: string) {
  return page.getByRole("button", { name: `Gérer le groupe ${nom}`, exact: true }).locator("xpath=ancestor::li[1]");
}

/** De la page d'un groupe à la liste (le menu des paramètres a aussi son « Groupes »). */
async function retourALaListe(page: Page) {
  await page.getByTestId("settings-content").getByRole("button", { name: "Groupes", exact: true }).click();
  await expect(page.getByRole("region", { name: "Groupes de personas" })).toBeVisible();
}

async function supprimer(page: Page, nom: string) {
  // Un échec ou un saut peut laisser la page d'un groupe ouverte.
  const retour = page.getByTestId("settings-content").getByRole("button", { name: "Groupes", exact: true });
  if (await retour.count()) await retourALaListe(page);
  const bouton = page.getByRole("button", { name: `Actions du groupe ${nom}`, exact: true });
  if (!(await bouton.count())) return;
  await bouton.click();
  await page.getByRole("menuitem", { name: "Supprimer le groupe", exact: true }).click();
  await expect(page.getByRole("button", { name: `Actions du groupe ${nom}`, exact: true })).toHaveCount(0);
}

/** Crée un groupe sur sa page, depuis la liste, et reste sur la page du groupe créé. */
async function creer(page: Page, nom: string, titre: string) {
  await page.getByRole("textbox", { name: "Nom du groupe" }).fill(nom);
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.getByRole("heading", { level: 3, name: titre })).toBeVisible();
}

test("Groupes : créer un groupe et un sous-groupe, couper sa couleur, et les retrouver au rechargement", async ({ page }) => {
  await ouvrirOngletGroupes(page);
  try {
    // Un groupe à la racine.
    await page.getByRole("button", { name: "Nouveau groupe", exact: true }).click();
    await creer(page, GROUPE, GROUPE);
    await retourALaListe(page);

    // Un sous-groupe, depuis le menu de la ligne : il hérite de la couleur de son parent.
    await page.getByRole("button", { name: `Actions du groupe ${GROUPE}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Ajouter un sous-groupe" }).click();
    await expect(page.getByText(`Couleur héritée de « ${GROUPE} »`)).toBeVisible();
    await creer(page, SOUS_GROUPE, `${GROUPE} › ${SOUS_GROUPE}`);

    // Couper sa couleur.
    const bascule = page.getByRole("switch", { name: `Appliquer la couleur de ${SOUS_GROUPE}` });
    await expect(bascule).toHaveAttribute("data-state", "checked");
    await bascule.click();
    await expect(bascule).toHaveAttribute("data-state", "unchecked");
    await retourALaListe(page);
    await expect(ligne(page, SOUS_GROUPE)).toHaveAttribute("data-depth", "1");
    await expect(ligne(page, SOUS_GROUPE).locator("[data-inherited]")).toHaveCount(1);

    // Tout est en base : le rechargement rend le même arbre.
    await page.reload();
    await sectionGroupes(page).click();
    await expect(ligne(page, SOUS_GROUPE)).toHaveAttribute("data-depth", "1");
    await page.getByRole("button", { name: `Gérer le groupe ${SOUS_GROUPE}`, exact: true }).click();
    await expect(page.getByRole("switch", { name: `Appliquer la couleur de ${SOUS_GROUPE}` })).toHaveAttribute("data-state", "unchecked");
    await retourALaListe(page);

    // Supprimer le parent : le sous-groupe remonte à la racine.
    await supprimer(page, GROUPE);
    await expect(ligne(page, SOUS_GROUPE)).toHaveAttribute("data-depth", "0");
  } finally {
    await supprimer(page, SOUS_GROUPE);
    await supprimer(page, GROUPE);
  }
});

test("Page d'un groupe : nom, description, ajout d'un persona, groupe principal, retrouvés au rechargement", async ({ page }) => {
  const nom = `E2E fiche ${Date.now()}`;
  const renomme = `${nom} renommé`;
  await ouvrirOngletGroupes(page);
  try {
    await page.getByRole("button", { name: "Nouveau groupe", exact: true }).click();
    await page.getByRole("textbox", { name: "Description" }).fill("Groupe de test E2E");
    await creer(page, nom, nom);

    // Le nom se modifie sur la page, et s'enregistre en quittant le champ.
    const champ = page.getByRole("textbox", { name: "Nom du groupe" });
    await champ.fill(renomme);
    await champ.blur();
    await expect(page.getByRole("heading", { level: 3, name: renomme })).toBeVisible();

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
    const ouvrir = page.getByRole("button", { name: `Gérer le groupe ${renomme}`, exact: true });
    await expect(ouvrir).toContainText("1 membre");
    await expect(ouvrir).toContainText("Groupe de test E2E");
  } finally {
    // Supprimer le groupe emporte ses affectations ; le persona retrouve son ancien principal.
    await supprimer(page, renomme);
    await supprimer(page, nom);
  }
});
