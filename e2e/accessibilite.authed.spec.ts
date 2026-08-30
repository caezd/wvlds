import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { trouverLienSalon } from "./decouverte";

// ──────────────────────────────────────────────────────────────────────────
// Vérification d'accessibilité sur les pages réellement rendues.
//
// Pourquoi ce fichier existe. Un contrôle statique sur le code source dit des
// choses utiles — un bouton dont le seul enfant est une icône n'a pas de nom —
// mais il ne voit ni ce que produisent les composants tiers, ni le contraste
// obtenu, ni les identifiants ARIA résolus. C'est exactement là que se
// trouvaient les défauts :
//
//   • Les repères de mondes de la barre latérale étaient des `<div>` sur la
//     page courante. ARIA y interdit `aria-label` et `aria-current` : les deux
//     étaient ignorés. Le monde où l'on se trouve n'avait aucun nom, et rien
//     n'indiquait qu'on y était.
//   • Les deux onglets de /p pilotaient un contenu rendu HORS du `<Tabs>` :
//     leur `aria-controls` désignait un panneau inexistant.
//   • Les cartes de personas s'annonçaient « déplaçable, bouton » alors que ce
//     contexte n'a qu'un capteur de pointeur — le glisser au clavier n'existe
//     pas —, et les vrais boutons de la carte se retrouvaient imbriqués dans
//     cette fausse commande.
//   • Le petit texte en `text-muted-foreground/60` plafonnait à 3.2:1 là où la
//     norme AA en demande 4.5.
//   • Deux listes déroulantes et un lien à icône seule n'avaient pas de nom.
//   • Les zones défilantes ne pouvaient pas recevoir le focus : leur contenu
//     était hors d'atteinte au clavier.
//
// Vingt-deux nœuds fautifs, huit règles, aucune visible depuis le code seul.
// ──────────────────────────────────────────────────────────────────────────

/** Le corpus de règles WCAG 2.1 niveau A et AA. */
const REGLES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Temps laissé au client pour se monter avant l'analyse.
 *
 * Même valeur, et même raison, que le balayage de routes : mesuré à ~2 s entre
 * `domcontentloaded` et la fin du montage, plus une marge. Analyser trop tôt
 * examinerait une page encore vide, ce qui passerait toujours.
 */
const DELAI_MONTAGE_MS = 2_500;

/** Routes simples, sans paramètre. */
const ROUTES = ["/explore", "/p", "/settings", "/shop", "/changelog", "/quests"];

/** Vues d'un monde : ce sont les écrans les plus riches de l'application. */
const VUES = ["wiki", "canvas", "map", "members", "personas"];

/** Analyse une page et rend une description lisible de chaque violation. */
async function violations(page: Page, url: string): Promise<string[]> {
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

test.describe("accessibilité des pages rendues", () => {
  // Chaque page est un chargement complet ; même raison que le balayage de
  // routes pour ne pas les paralléliser face au serveur de développement.
  test.describe.configure({ mode: "default" });
  test.setTimeout(180_000);

  test("aucune violation WCAG A/AA sur les routes connectées", async ({ page }) => {
    const fautes: string[] = [];
    let analysees = 0;

    for (const route of ROUTES) {
      fautes.push(...(await violations(page, route)));
      analysees++;
    }

    // Un monde, puis ses vues : elles montent le canevas de relations, la
    // carte, le wiki et le catalogue, soit les composants les plus lourds.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(DELAI_MONTAGE_MS);
    const monde = await page.evaluate(
      () => (document.querySelector('a[href^="/w/"]') as HTMLAnchorElement)?.getAttribute("href"),
    );
    expect(monde, "aucun monde accessible pour le compte de test").toBeTruthy();
    for (const url of [monde!, ...VUES.map((v) => `${monde}?view=${v}`)]) {
      fautes.push(...(await violations(page, url)));
      analysees++;
    }

    const salon = await trouverLienSalon(page);
    expect(salon, "aucun salon accessible pour le compte de test").toBeTruthy();
    fautes.push(...(await violations(page, salon!)));
    analysees++;

    // Garde-fou du garde-fou : une exécution qui n'aurait rien analysé
    // passerait aussi, et ne dirait rien.
    expect(analysees).toBe(ROUTES.length + VUES.length + 2);

    expect(
      fautes,
      fautes.length
        ? "Violations d'accessibilité sur les pages rendues :" +
          String.fromCharCode(10) +
          fautes.join(String.fromCharCode(10))
        : "",
    ).toEqual([]);
  });
});
