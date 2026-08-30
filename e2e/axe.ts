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
export async function violations(page: Page, url: string): Promise<string[]> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(DELAI_MONTAGE_MS);
  const res = await new AxeBuilder({ page }).withTags(REGLES).analyze();
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
