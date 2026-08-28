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

/**
 * Temps laissé au client pour se monter avant de juger une page.
 *
 * 2 500 ms : mesuré à ~2 s entre `domcontentloaded` et l'apparition de la
 * frontière d'erreur sur une page volontairement cassée, plus une marge.
 */
const DELAI_MONTAGE_MS = 2_500;

/**
 * Collecte les exceptions non rattrapées pendant la visite d'une page.
 *
 * Rend de quoi se retirer : `verifierRoute` est appelée en boucle pour les
 * vues d'un monde, et sans ce retrait chaque tour laisserait un écouteur de
 * plus attaché à la page.
 */
function surveiller(page: Page): { erreurs: string[]; arreter: () => void } {
  const erreurs: string[] = [];
  const surErreur = (e: Error) => {
    if (BRUIT_DU_SERVEUR_DE_DEV.test(e.message)) return;
    erreurs.push(`exception : ${e.message}`);
  };
  page.on("pageerror", surErreur);
  return { erreurs, arreter: () => page.off("pageerror", surErreur) };
}

/**
 * Instrumentation de Next en développement, à ne pas confondre avec un défaut
 * de l'application.
 *
 * `next dev` chronomètre le rendu de chaque composant serveur via
 * `performance.measure`. Sur une page qui redirige — `/quests` quand son
 * drapeau est baissé — la marque de fin précède celle de début et le navigateur
 * refuse la mesure :
 *
 *   Failed to execute 'measure' on 'Performance': 'QuestsPage' cannot have a
 *   negative time stamp.
 *
 * Vérifié plutôt que supposé : la même suite passe 25/25 contre un build de
 * production, où cette instrumentation n'existe pas. Le filtre est donc étroit,
 * limité à cette API — toute autre exception reste un échec.
 */
const BRUIT_DU_SERVEUR_DE_DEV = /Failed to execute 'measure' on 'Performance'/;

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
  const { erreurs, arreter } = surveiller(page);
  try {
    const reponse = await page.goto(chemin, { waitUntil: "domcontentloaded" });
    expect(reponse, `aucune réponse pour ${chemin}`).not.toBeNull();

    // Laisser le client se monter avant de conclure quoi que ce soit.
    //
    // Ce contrôle a d'abord été écrit sans attente, et il ne valait rien : en
    // cassant volontairement le canevas de relations, la page passait au vert.
    // Mesuré alors — juste après `domcontentloaded`, le corps ne contient que
    // la coque et la frontière d'erreur est absente ; deux secondes plus tard,
    // elle est là. Les composants lourds arrivent par import dynamique et la
    // frontière ne se déclenche qu'après hydratation.
    //
    // `networkidle` ne convient pas : l'application garde des websockets
    // ouvertes et ne devient jamais inactive.
    await page.waitForLoadState("load");
    await page.waitForTimeout(DELAI_MONTAGE_MS);

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
  } finally {
    arreter();
  }
}

/** Chemin d'un monde accessible au compte de test. */
async function trouverUnMonde(page: Page): Promise<string | null> {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(w\/|explore)/, { timeout: 20_000 });
  if (/\/w\//.test(page.url())) return new URL(page.url()).pathname;

  const lien = page.locator('a[href^="/w/"]').first();
  if (!(await lien.count())) return null;
  return new URL((await lien.getAttribute("href")) ?? "/", page.url()).pathname;
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
  // Le balayage des vues d'un monde enchaîne neuf chargements, chacun suivi de
  // son délai de montage : c'est lui qui fixe la limite, pas les autres tests.
  test.setTimeout(120_000);

  for (const chemin of ROUTES) {
    test(`${chemin}`, async ({ page }) => {
      await verifierRoute(page, chemin);
    });
  }

  // Les vues d'un monde ne sont pas des routes mais un paramètre d'URL. Elles
  // montent pourtant les composants les plus lourds de l'application — le
  // canevas de relations, la carte, le wiki, le catalogue. Sans ce balayage,
  // une seule d'entre elles était chargée par les tests : la vue par défaut.
  const VUES = ["canvas", "catalogue", "wiki", "map", "timeline", "members", "personas", "settings"];

  test("/w/[id] — la page d'un monde et toutes ses vues", async ({ page }) => {
    const base = await trouverUnMonde(page);
    // `expect` et non `test.skip` : un test sauté est un trou silencieux.
    expect(base, "aucun monde accessible pour le compte de test").not.toBeNull();

    await verifierRoute(page, base!);
    for (const vue of VUES) {
      await verifierRoute(page, `${base}?view=${vue}`);
    }
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
