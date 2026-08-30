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
//
// ── Sur la fragilité corrigée le 2026-08-30 ──────────────────
// La version précédente relevait les NOMS des mondes, refermait le menu par
// `Escape`, puis le rouvrait pour chacun afin de le retrouver par son texte.
// Deux défauts :
//
//   1. Le `Escape` et la réouverture s'enchaînaient trop vite : le second clic
//      REFERMAIT le menu au lieu de l'ouvrir, la recherche par texte ne
//      trouvait rien, et le monde était déclaré « absent de la liste ».
//   2. Rien n'attendait que les entrées soient visibles avant de les lire.
//
// Le résultat était un helper qui marchait tant que le compte atterrissait sur
// un monde ayant des salons, et qui tombait dès que `last_world_id` changeait —
// ce que fait toute spec visitant un monde. Quatre specs en dépendent.
//
// La version ci-dessous n'ouvre le menu que pour agir, ne le referme jamais
// « pour rien », et désigne les entrées par leur POSITION plutôt que par leur
// texte. Elle mémorise les noms déjà essayés pour ne pas tourner en rond : la
// liste exclut le monde courant, donc les positions se décalent à chaque
// navigation.
// ──────────────────────────────────────────────────────────────────────────

/** Nombre maximal de mondes visités avant d'abandonner. */
const MONDES_MAX = 12;

/**
 * Ouvre un monde qui expose au moins un salon et rend le `href` de ce salon.
 *
 * Le sélecteur change de monde par `router.push`, pas par un lien : il faut
 * ouvrir sa liste et cliquer les entrées.
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

  const nomsEssayes = new Set<string>();

  for (let tour = 0; tour < MONDES_MAX; tour++) {
    const ici = await premierSalon();
    if (ici) return ici;

    const trigger = page.getByTestId("world-picker-trigger");
    if (!(await trigger.count())) return null;

    await trigger.click();
    const items = page.getByTestId("world-picker-item");
    // Attendre l'ouverture : lire la liste trop tôt la trouve vide, et le
    // parcours s'arrêtait alors en croyant le compte sans autre monde.
    await items.first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});

    const noms = await items.evaluateAll((els) =>
      els.map((e) => (e.textContent ?? "").trim()),
    );
    const suivant = noms.findIndex((n) => !nomsEssayes.has(n));
    if (suivant === -1) {
      await page.keyboard.press("Escape");
      return null; // tous les mondes du compte ont été visités
    }
    nomsEssayes.add(noms[suivant]);

    const avant = page.url();
    await items.nth(suivant).click();
    // Attendre que l'URL CHANGE, pas seulement qu'elle corresponde : on est
    // déjà sur une page de monde, donc `waitForURL(/\/w\//)` serait satisfait
    // immédiatement et l'on inspecterait l'ancien affichage.
    await page.waitForURL((u) => u.toString() !== avant, { timeout: 20_000 });
    await page.waitForLoadState("domcontentloaded");
  }

  return null;
}
