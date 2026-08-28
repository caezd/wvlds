import { test, expect, type Page } from "@playwright/test";

import { trouverLienSalon } from "./decouverte";

// ──────────────────────────────────────────────────────────────────────────
// Parcours de toutes les routes connectées : chacune doit rendre.
//
// Pourquoi ce fichier existe. Le 2026-08-28, une modification des providers du
// layout racine a mis `/auth/login` en erreur 500 — et l'application entière
// avec. Aucun test unitaire ne pouvait le voir : ils remplacent next-intl par
// un mock, donc le contexte manquant n'existe pas pour eux. Le seul contrôle
// possible est de charger les pages pour de vrai.
//
// La couverture d'alors ne visitait que `/auth/login` et deux routes
// connectées. Un provider cassé abattait toutes les autres sans qu'aucun test
// ne bronche.
//
// Ce que chaque route doit satisfaire :
//   1. le document ne répond pas en erreur (statut < 400)
//   2. aucune exception non rattrapée côté navigateur
//   3. la frontière d'erreur des pages protégées ne s'affiche pas
//   4. la page a bien rendu quelque chose
//
// Ce n'est pas un test fonctionnel : il ne dit rien de ce que la page montre.
// Il dit qu'elle s'affiche — ce qui est exactement ce qui manquait.
// ──────────────────────────────────────────────────────────────────────────

/** Erreurs collectées pendant la visite d'une page. */
function surveiller(page: Page): string[] {
  const erreurs: string[] = [];
  page.on("pageerror", (e) => erreurs.push(`exception : ${e.message}`));
  return erreurs;
}

/**
 * Charge une route et vérifie qu'elle rend.
 *
 * Les redirections sont acceptées : plusieurs pages en dépendent légitimement
 * (`/` mène à un monde ou à `/explore`, `/quests` renvoie à l'accueil quand le
 * drapeau est baissé, les pages d'administration écartent un compte ordinaire).
 * Ce qui est refusé, c'est l'erreur — et le retour à la connexion, qui
 * signalerait une session perdue.
 */
async function verifierRoute(page: Page, chemin: string) {
  const erreurs = surveiller(page);

  const reponse = await page.goto(chemin, { waitUntil: "domcontentloaded" });
  expect(reponse, `aucune réponse pour ${chemin}`).not.toBeNull();

  // Un statut nu ne dit pas quoi corriger. En cas d'erreur on remonte ce que
  // le serveur a écrit : en développement Next y place le message et la pile.
  if (reponse!.status() >= 400) {
    const corps = await reponse!.text().catch(() => "(corps illisible)");
    const extrait = corps
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);
    expect(
      reponse!.status(),
      `${chemin} répond ${reponse!.status()}\n--- corps ---\n${extrait}`,
    ).toBeLessThan(400);
  }

  // Une session perdue transformerait tout le parcours en succès trompeur :
  // la page de connexion rend parfaitement, elle.
  await expect(page, `${chemin} a renvoyé vers la connexion`).not.toHaveURL(/\/auth\/login/);

  await expect(
    page.getByTestId("error-boundary"),
    `${chemin} est retombée sur la frontière d'erreur`,
  ).toHaveCount(0);

  // Une page blanche passerait les trois contrôles précédents.
  const texte = await page.locator("body").innerText();
  expect(texte.trim().length, `${chemin} a rendu une page vide`).toBeGreaterThan(0);

  expect(erreurs, `${chemin} :\n${erreurs.join("\n")}`).toEqual([]);
}

/** Routes connectées sans paramètre. */
const ROUTES = [
  "/",
  "/explore",
  "/p",
  "/settings",
  "/shop",
  "/changelog",
  "/quests",
  "/legal",
  // Écartent un compte ordinaire par une redirection — ce qui est justement le
  // comportement à vérifier : elles ne doivent pas exploser.
  "/admin",
  "/admin/features",
  "/admin/shop",
  "/admin/users",
  "/admin/translations",
];

test.describe("Toutes les routes connectées rendent", () => {
  // Chaque route est un chargement de page complet ; le parallélisme total
  // ouvrirait autant de sessions Realtime sur le serveur de développement.
  test.describe.configure({ mode: "default" });
  test.setTimeout(60_000);

  for (const chemin of ROUTES) {
    test(`${chemin}`, async ({ page }) => {
      await verifierRoute(page, chemin);
    });
  }

  test("/w/[id] — page d'un monde", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/(w\/|explore)/, { timeout: 20_000 });

    const lienMonde = page.locator('a[href^="/w/"]').first();
    const url = /\/w\//.test(page.url())
      ? page.url()
      : (await lienMonde.count())
        ? new URL(await lienMonde.getAttribute("href") ?? "/", page.url()).pathname
        : null;

    test.skip(url === null, "aucun monde accessible pour le compte de test");
    await verifierRoute(page, url!);
  });

  test("/c/[id] — page d'un salon", async ({ page }) => {
    // Passe par la découverte partagée : le monde d'arrivée n'a pas forcément
    // de salon, et se contenter de regarder la première page mettrait ce test
    // en « skip » — un trou silencieux dans une suite verte.
    const href = await trouverLienSalon(page);
    expect(href, "aucun salon accessible pour le compte de test").not.toBeNull();
    await verifierRoute(page, href!);
  });
});
