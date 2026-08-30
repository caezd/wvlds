import { test, expect } from "@playwright/test";

import { trouverLienSalon } from "./decouverte";

// ──────────────────────────────────────────────────────────────────────────
// Reconnexion réseau et canaux Realtime.
//
// À chaque retour de connexion, `useReconnectEpoch` change et tous les canaux
// sont refermés puis rouverts sous le MÊME nom. Dans supabase-js,
// `channel(topic)` rend le canal déjà enregistré sous ce nom, et
// `removeChannel()` est asynchrone : une réouverture synchrone récupérait donc
// un canal encore joint, sur lequel `.on()` lève
//
//   cannot add `postgres_changes` callbacks for realtime:<nom> after `subscribe()`
//
// Six endroits étaient concernés (messages, notifications, messages privés,
// présence de salon, présence globale, liste des salons). `lib/realtimeChannel`
// sérialise désormais l'enchaînement.
//
// Les tests unitaires couvrent le mécanisme ; celui-ci vérifie ce qu'aucun mock
// ne peut garantir : que l'application réelle traverse une coupure sans lever.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Émet un événement de fenêtre, en tolérant une navigation concurrente.
 *
 * Attendre que l'URL cesse de bouger ne suffit pas : l'application navigue
 * aussi côté client, et `page.evaluate` lancé pendant que le contexte est
 * remplacé lève « Execution context was destroyed ». Ce n'était pas un défaut
 * de l'application mais une fluctuation du test — qui passait isolément et
 * échouait une fois sur quelques suites complètes.
 *
 * On réessaie donc sur cette erreur précise, après avoir laissé la navigation
 * se terminer. Toute autre erreur remonte telle quelle.
 */
async function emettre(page: import("@playwright/test").Page, nom: string) {
  for (let essai = 0; ; essai++) {
    try {
      await page.evaluate((n) => {
        window.dispatchEvent(new Event(n));
      }, nom);
      return;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (essai >= 3 || !/Execution context was destroyed|context was destroyed/i.test(message)) {
        throw e;
      }
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500);
    }
  }
}

/** Rejoue une coupure puis un retour de connexion, comme le navigateur. */
async function couperPuisRetablir(page: import("@playwright/test").Page) {
  // `networkidle` ne convient pas — l'application garde des websockets
  // ouvertes et ne devient jamais inactive. On attend le chargement du
  // document, puis on vérifie que l'URL a cessé de bouger.
  await page.waitForLoadState("domcontentloaded");
  let precedente = "";
  for (let i = 0; i < 20 && page.url() !== precedente; i++) {
    precedente = page.url();
    await page.waitForTimeout(250);
  }
  await emettre(page, "offline");
  await page.waitForTimeout(200);
  await emettre(page, "online");
  // Laisse la fermeture se propager et la réouverture s'enchaîner.
  await page.waitForTimeout(1500);
}

/**
 * Ouvre un salon accessible au compte de test.
 *
 * La découverte elle-même vit dans `./decouverte` : le parcours des mondes à la
 * recherche d'un salon sert aussi au balayage des routes, et l'avoir en double
 * garantissait qu'une seule des deux copies serait corrigée.
 */
async function ouvrirUnSalon(page: import("@playwright/test").Page) {
  const href = await trouverLienSalon(page);
  expect(href, "aucun salon accessible pour le compte de test").not.toBeNull();
  await page.goto(href!);
  await expect(page).toHaveURL(/\/c\//, { timeout: 20_000 });
}

test.describe("Realtime — retour de connexion réseau", () => {
  // Séquentiel : chaque test parcourt les mondes pour trouver un salon, et
  // trois navigations concurrentes sur le serveur de développement se
  // gênaient. Ils partagent la même préparation, ils partagent le worker.
  test.describe.configure({ mode: "default" });
  // Chaque test coupe le réseau et attend des reconnexions : lent par nature.
  test.setTimeout(90_000);

  test("aucune erreur de canal après plusieurs coupures", async ({ page }) => {
    const erreurs: string[] = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") erreurs.push(m.text());
    });

    // On part d'une page concrète plutôt que de « / » : la racine redirige
    // côté client, et une coupure déclenchée pendant cette redirection détruit
    // le contexte d'exécution sous les pieds de `page.evaluate`.
    await ouvrirUnSalon(page);

    // Plusieurs cycles : le défaut se manifestait dès le premier, mais
    // l'enchaînement de fermetures est justement ce qui est délicat.
    for (let i = 0; i < 3; i++) await couperPuisRetablir(page);

    const canaux = erreurs.filter((e) => /after `subscribe\(\)`|realtime:/i.test(e));
    expect(canaux, `erreurs de canal :\n${canaux.join("\n")}`).toEqual([]);
  });

  test("le salon reste fonctionnel après une coupure", async ({ page }) => {
    const erreurs: string[] = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") erreurs.push(m.text());
    });

    await ouvrirUnSalon(page);

    await couperPuisRetablir(page);

    // La vue tient toujours debout : le composeur est là et reste utilisable.
    await expect(page.getByTestId("editor").or(page.locator("[contenteditable]")).first())
      .toBeVisible({ timeout: 10_000 });

    const canaux = erreurs.filter((e) => /after `subscribe\(\)`|realtime:/i.test(e));
    expect(canaux, `erreurs de canal :\n${canaux.join("\n")}`).toEqual([]);
  });

  test("l'ouverture du tiroir latéral ne lève pas", async ({ page }) => {
    // C'est le geste qui plantait : le tiroir monte une SECONDE instance de la
    // liste des salons, qui partageait auparavant le nom de canal de la
    // première.
    const erreurs: string[] = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") erreurs.push(m.text());
    });

    await ouvrirUnSalon(page);

    // Le tiroir mobile n'existe qu'en dessous de `lg`.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);

    // Repère stable : le libellé dépend de la langue du navigateur, qui
    // annonce `en-US` en test. Et on cible celui qui est VISIBLE : deux
    // boutons portent ce repère — celui d'AppShell, masqué sur une page de
    // salon, et celui de la vue du salon, qui le remplace.
    const menu = page.getByTestId("open-mobile-menu").locator("visible=true").first();
    await expect(menu).toBeVisible({ timeout: 10_000 });

    await menu.click();
    await page.waitForTimeout(1000);
    // Puis on referme et rouvre : c'est le cycle qui recrée les canaux.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await menu.click();
    await page.waitForTimeout(1000);

    const canaux = erreurs.filter((e) => /after `subscribe\(\)`|realtime:/i.test(e));
    expect(canaux, `erreurs de canal :\n${canaux.join("\n")}`).toEqual([]);
  });
});
