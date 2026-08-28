import { expect, type Page } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────────
// Découverte des données du compte de test, partagée par les specs.
//
// Le compte appartient à plusieurs mondes, dont certains sans aucun salon :
// arriver sur `/` peut très bien atterrir sur un monde vide. Une spec qui se
// contente de chercher un lien `/c/…` sur la première page se met alors en
// « skip » — et une suite verte qui n'a rien vérifié est pire qu'un échec.
//
// D'où ce parcours : si le monde courant n'expose aucun salon, on ouvre le
// sélecteur de mondes et on visite les autres jusqu'à en trouver un.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Ouvre un monde qui expose au moins un salon et rend le `href` de ce salon.
 *
 * Le sélecteur change de monde par `router.push`, pas par un lien : il faut
 * ouvrir sa liste et cliquer les entrées. On parcourt par NOM et non par
 * position, car la liste exclut le monde courant — sa composition change donc
 * à chaque navigation.
 *
 * Exige une largeur « bureau » : le sélecteur vit dans l'aside, masqué en
 * dessous de `lg`.
 *
 * @returns le `href` du salon, ou `null` si le compte n'en a aucun
 */
export async function trouverLienSalon(page: Page): Promise<string | null> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/(w\/|explore)/, { timeout: 20_000 });
  await page.waitForLoadState("domcontentloaded");

  const premierSalon = async () => {
    const lien = page.locator('a[href^="/c/"]').first();
    return (await lien.count()) ? lien.getAttribute("href") : null;
  };

  const ici = await premierSalon();
  if (ici) return ici;

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

    const trouve = await premierSalon();
    if (trouve) return trouve;
  }
  return null;
}
