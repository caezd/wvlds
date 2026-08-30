import { test, expect } from "@playwright/test";

import { trouverLienSalon } from "./decouverte";
import { violations, rapport } from "./axe";

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
//
// Le pendant sans session vit dans `accessibilite.spec.ts`.
// ──────────────────────────────────────────────────────────────────────────

/** Routes simples, sans paramètre. */
const ROUTES = ["/explore", "/p", "/settings", "/shop", "/changelog", "/quests"];

/** Vues d'un monde : ce sont les écrans les plus riches de l'application. */
// `catalogue`, `timeline` et `settings` ont été ajoutées après coup : la
// première y cachait deux textes sous 4.5:1. Les écrans d'administration,
// mesurés propres, restent hors de ce balayage — la suite E2E ne tourne pas
// en CI, faute de secrets, et sa durée se paie donc à chaque exécution
// locale ; ils sont déjà visités par `routes.authed.spec.ts`.
const VUES = ["wiki", "canvas", "map", "members", "personas", "catalogue", "timeline", "settings"];

test.describe("accessibilité des pages rendues", () => {
  // Chaque page est un chargement complet ; même raison que le balayage de
  // routes pour ne pas les paralléliser face au serveur de développement.
  test.describe.configure({ mode: "default" });
  test.setTimeout(180_000);

  test("aucune violation WCAG A/AA sur les routes connectées", async ({ page }) => {
    const fautes: string[] = [];
    let analysees = 0;

    // La découverte D'ABORD, et le monde qu'elle retient ensuite.
    //
    // L'ordre inverse rendait ce test instable : visiter les vues d'un monde
    // quelconque fixe le cookie `last_world_id`, et `trouverLienSalon` part
    // ensuite de `/`, qui y ramène. Si ce monde-là n'a pas de salon, la
    // découverte devait se rabattre sur le sélecteur de mondes — et échouait
    // parfois. Partir de la découverte donne un monde qui a forcément un
    // salon, et supprime la seconde navigation vers `/`.
    const salon = await trouverLienSalon(page);
    expect(salon, "aucun salon accessible pour le compte de test").toBeTruthy();
    // `trouverLienSalon` s'arrête SUR la page du monde qui porte ce salon.
    const monde = new URL(page.url()).pathname;
    expect(monde, "la découverte n'a pas abouti sur une page de monde").toMatch(/^\/w\//);

    for (const route of ROUTES) {
      fautes.push(...(await violations(page, route)));
      analysees++;
    }

    // Le monde et ses vues : elles montent le canevas de relations, la carte,
    // le wiki et le catalogue, soit les composants les plus lourds.
    for (const url of [monde, ...VUES.map((v) => `${monde}?view=${v}`)]) {
      fautes.push(...(await violations(page, url)));
      analysees++;
    }

    fautes.push(...(await violations(page, salon!)));
    analysees++;

    // Garde-fou du garde-fou : une exécution qui n'aurait rien analysé
    // passerait aussi, et ne dirait rien.
    expect(analysees).toBe(ROUTES.length + VUES.length + 2);

    expect(fautes, rapport(fautes)).toEqual([]);
  });
});
