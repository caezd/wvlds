import { createCssVariablesTheme, createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * Coloration syntaxique des champs de code de l'application (aujourd'hui : le
 * bloc HTML de la page d'accueil d'un monde).
 *
 * Assemblage à la carte plutôt que le paquet `shiki` complet : celui-ci
 * référence ~200 grammaires, que l'empaqueteur transforme en autant de
 * fragments. On ne déclare ici que ce qu'on colore réellement, deux langages.
 *
 * Moteur d'expressions régulières JavaScript, et non le moteur Oniguruma :
 * ce dernier est un binaire WebAssembly de plusieurs centaines de kilooctets,
 * démesuré pour deux grammaires. `forgiving` laisse tomber les rares motifs
 * qu'il ne sait pas traduire au lieu de refuser la grammaire entière : au pire
 * un fragment reste non coloré, ce qui est sans conséquence pour un champ de
 * saisie.
 *
 * Le tout est chargé à la demande et mémoïsé : plusieurs champs de code
 * ouverts dans la même page partagent une seule instance, et une page qui n'en
 * ouvre aucun ne télécharge rien.
 */

/**
 * Un seul thème, dont les couleurs sont des variables CSS résolues par la page
 * (voir les `--shiki-*` de app/globals.css) plutôt que des valeurs figées.
 *
 * C'est ce qui permet à la coloration de suivre la palette de l'application, et
 * de basculer clair/sombre exactement comme le reste de l'interface : la règle
 * `.dark` redéfinit les variables, le navigateur repeint. Avec deux thèmes
 * figés il aurait fallu connaître le thème courant au moment de colorer, donc
 * relire `next-themes`, recolorer à chaque bascule, et gérer l'écart entre le
 * rendu serveur et l'hydratation.
 */
/** Nom sous lequel le thème est enregistré, puis demandé à la coloration.
 *  Déclaré à part : `ThemeRegistration.name` est optionnel dans les types de
 *  Shiki, donc `THEME.name` ne serait pas une chaîne certaine. */
export const CODE_THEME = "wvlds";

const THEME = createCssVariablesTheme({ name: CODE_THEME, variablePrefix: "--shiki-", fontStyle: true });

export type CodeLanguage = "html" | "css";

let highlighter: Promise<HighlighterCore> | null = null;

export function getCodeHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [THEME],
    langs: [import("@shikijs/langs/html"), import("@shikijs/langs/css")],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighter;
}
