import { test, expect } from "@playwright/test";

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

/** Rejoue une coupure puis un retour de connexion, comme le navigateur. */
async function couperPuisRetablir(page: import("@playwright/test").Page) {
  // Attendre que la page ait fini de naviguer : `page.evaluate` sur un
  // contexte en cours de destruction lève « Execution context was destroyed ».
  // `networkidle` ne convient pas — l'application garde des websockets
  // ouvertes et ne devient jamais inactive. On attend le chargement du
  // document, puis on vérifie que l'URL a cessé de bouger.
  await page.waitForLoadState("domcontentloaded");
  let precedente = "";
  for (let i = 0; i < 20 && page.url() !== precedente; i++) {
    precedente = page.url();
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
  });
  // Laisse la fermeture se propager et la réouverture s'enchaîner.
  await page.waitForTimeout(1500);
}

/**
 * Ouvre un monde qui expose au moins un salon, et rend son lien.
 *
 * Le compte de test appartient à plusieurs mondes, dont certains sans aucun
 * salon : `/` peut atterrir sur un monde vide. Le rail des mondes est
 * désactivé et le sélecteur change de monde par `router.push`, pas par un
 * lien — il faut donc ouvrir sa liste et cliquer les entrées.
 *
 * On parcourt par NOM et non par position : la liste exclut le monde courant,
 * sa composition change donc à chaque navigation.
 *
 * Exige une largeur « bureau » : le sélecteur vit dans l'aside, masqué en
 * dessous de `lg`.
 */
async function ouvrirUnMondeAvecSalon(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/(w\/|explore)/, { timeout: 20_000 });
  await page.waitForLoadState("domcontentloaded");

  const salon = () => page.locator('a[href^="/c/"]');
  if (await salon().count()) return salon().first();

  const trigger = page.getByTestId("world-picker-trigger");
  if (!(await trigger.count())) return null;

  await trigger.click();
  const noms = await page
    .getByTestId("world-picker-item")
    .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
  await page.keyboard.press("Escape");

  for (const nom of noms) {
    await trigger.click();
    const item = page.getByTestId("world-picker-item").filter({ hasText: nom }).first();
    if (!(await item.count())) {
      await page.keyboard.press("Escape");
      continue; // monde devenu courant : il ne figure plus dans la liste
    }
    const avant = page.url();
    await item.click();
    // Attendre que l'URL CHANGE, pas seulement qu'elle corresponde : on est
    // déjà sur une page de monde, donc `waitForURL(/\/w\//)` serait satisfait
    // immédiatement et l'on inspecterait l'ancien affichage.
    await page.waitForURL((u) => u.toString() !== avant, { timeout: 20_000 });
    await page.waitForLoadState("domcontentloaded");
    if (await salon().count()) return salon().first();
  }
  return null;
}

test.describe("Realtime — retour de connexion réseau", () => {
  // Séquentiel : `beforeAll` s'exécute une fois par worker, et le
  // parallélisme total répartissait les tests sur des workers différents —
  // ceux qui n'avaient pas exécuté la découverte trouvaient `urlSalon` à
  // null. Ces trois tests partagent la même préparation, ils appartiennent
  // au même worker.
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
    const lienSalon = await ouvrirUnMondeAvecSalon(page);
    expect(lienSalon, "aucun salon accessible pour le compte de test").not.toBeNull();
    await lienSalon!.click();
    await expect(page).toHaveURL(/\/c\//, { timeout: 20_000 });

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

    const lienSalon = await ouvrirUnMondeAvecSalon(page);
    expect(lienSalon, "aucun salon accessible pour le compte de test").not.toBeNull();
    await lienSalon!.click();
    await expect(page).toHaveURL(/\/c\//, { timeout: 20_000 });

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

    const lienSalon = await ouvrirUnMondeAvecSalon(page);
    expect(lienSalon, "aucun salon accessible pour le compte de test").not.toBeNull();
    await lienSalon!.click();
    await expect(page).toHaveURL(/\/c\//, { timeout: 20_000 });

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
