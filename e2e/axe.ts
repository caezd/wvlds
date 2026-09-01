import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────────
// Analyse d'accessibilité partagée entre les pages publiques et connectées.
//
// L'analyse statique du code source ne voit ni ce que produisent les
// composants tiers, ni le contraste obtenu, ni les identifiants ARIA résolus.
// C'est exactement là que se trouvaient les vingt-deux défauts du premier
// passage — aucun n'était visible depuis le code seul.
// ──────────────────────────────────────────────────────────────────────────

/** Le corpus de règles WCAG 2.1 niveau A et AA. */
export const REGLES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Temps laissé au client pour se monter avant l'analyse.
 *
 * Même valeur, et même raison, que le balayage de routes : mesuré à ~2 s entre
 * `domcontentloaded` et la fin du montage, plus une marge. Analyser trop tôt
 * examinerait une page encore vide, ce qui passerait toujours.
 */
export const DELAI_MONTAGE_MS = 2_500;

/**
 * Charge une page et rend une description lisible de chaque violation.
 *
 * Les chiffres de contraste viennent d'axe et non d'un calcul maison : les
 * couleurs de cette application sont exprimées en `oklab`, qu'un analyseur
 * naïf lit comme du RGB — au point de rendre 1.01:1 pour du texte
 * parfaitement lisible. Vérifié.
 */
/**
 * Laisse la page arriver là où elle va, et s'y monter.
 *
 * Certaines routes redirigent, parfois en chaîne : `/quests` renvoie à `/`
 * quand son drapeau est baissé, et `/` mène ensuite à un monde. Attendre le
 * montage une seule fois laisserait le délai s'écouler sur une page
 * intermédiaire, et mesurerait une étape du chemin plutôt que l'arrivée.
 *
 * On redonne donc son délai à toute page qui a navigué pendant le précédent.
 * Trois tours suffisent — aucune route n'enchaîne plus de deux redirections.
 */
async function attendreArrivee(page: Page): Promise<void> {
  for (let tour = 0; tour < 3; tour++) {
    const avant = page.url();
    await page.waitForTimeout(DELAI_MONTAGE_MS);
    if (page.url() === avant) return;
  }
}

/** Le symptôme d'une navigation survenue pendant l'analyse. */
const CONTEXTE_DETRUIT = "Execution context was destroyed";

/**
 * Analyse la page, en tolérant qu'elle navigue une fois de trop.
 *
 * Attendre l'arrivée ne suffit pas : il reste des navigations qui se déclenchent
 * APRÈS la dernière vérification, pendant l'analyse elle-même — axe perd alors
 * son contexte d'exécution, au hasard du minutage.
 *
 * La seconde tentative n'est pas une reprise aveugle : elle ne rattrape que ce
 * symptôme précis, et seulement après avoir laissé la page arriver de nouveau.
 * Ce qui est mesuré reste donc la page où l'on a fini par atterrir. Toute autre
 * erreur ressort telle quelle, et un second échec aussi : ce serait le signe
 * d'une page qui ne se pose jamais, ce qu'un test doit dire et non absorber.
 */
async function analyser(page: Page) {
  for (let tentative = 0; ; tentative++) {
    await attendreArrivee(page);
    try {
      return await new AxeBuilder({ page }).withTags(REGLES).analyze();
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      if (tentative >= 1 || !message.includes(CONTEXTE_DETRUIT)) throw erreur;
    }
  }
}

export async function violations(page: Page, url: string): Promise<string[]> {
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const res = await analyser(page);
  return res.violations.flatMap((v) =>
    v.nodes.map((nd) => {
      const d = (nd.any?.[0]?.data ?? {}) as Record<string, unknown>;
      const chiffres =
        d.contrastRatio !== undefined
          ? ` (ratio ${d.contrastRatio}, attendu ${d.expectedContrastRatio})`
          : "";
      return `${url} — ${v.impact} — ${v.id}${chiffres} — ${(nd.html ?? "").slice(0, 120)}`;
    }),
  );
}

/** Message d'échec : la liste des violations, une par ligne. */
export function rapport(fautes: string[]): string {
  if (!fautes.length) return "";
  const saut = String.fromCharCode(10);
  return "Violations d'accessibilité sur les pages rendues :" + saut + fautes.join(saut);
}
