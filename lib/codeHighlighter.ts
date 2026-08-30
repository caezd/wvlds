import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * Coloration syntaxique des champs de code de l'application (aujourd'hui : les
 * blocs HTML et Markdown de la page d'accueil d'un monde).
 *
 * Assemblage à la carte plutôt que le paquet `shiki` complet : celui-ci
 * référence ~200 grammaires, que l'empaqueteur transforme en autant de
 * fragments. On ne déclare ici que ce qu'on colore réellement, trois langages
 * et un thème.
 *
 * Moteur d'expressions régulières JavaScript, et non le moteur Oniguruma :
 * ce dernier est un binaire WebAssembly de plusieurs centaines de kilooctets,
 * démesuré pour trois grammaires. `forgiving` laisse tomber les rares motifs
 * qu'il ne sait pas traduire au lieu de refuser la grammaire entière : au pire
 * un fragment reste non coloré, ce qui est sans conséquence pour un champ de
 * saisie.
 *
 * Le tout est chargé à la demande et mémoïsé : plusieurs champs de code
 * ouverts dans la même page partagent une seule instance, et une page qui n'en
 * ouvre aucun ne télécharge rien.
 */
export const CODE_THEME = "vesper";

export type CodeLanguage = "html" | "css" | "markdown";

let highlighter: Promise<HighlighterCore> | null = null;

export function getCodeHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [import("@shikijs/themes/vesper")],
    langs: [
      import("@shikijs/langs/html"),
      import("@shikijs/langs/css"),
      import("@shikijs/langs/markdown"),
    ],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighter;
}

/**
 * Colore un extrait, sans le fond du thème.
 *
 * Shiki pose normalement la couleur de fond du thème en style en ligne sur son
 * `<pre>`, ce qui découperait un rectangle opaque au milieu du tiroir. On la
 * remplace par du transparent à la génération plutôt que de la masquer par une
 * règle CSS : le style en ligne l'emporterait sur une classe ordinaire, il
 * faudrait un `!important`, et le résultat ne serait plus vérifiable sans
 * moteur de rendu. Le fond est lu sur le thème résolu plutôt qu'écrit en dur,
 * pour survivre à un changement de thème.
 */
export async function highlightCode(code: string, lang: CodeLanguage): Promise<string> {
  const hl = await getCodeHighlighter();
  const fond = hl.getTheme(CODE_THEME).bg;
  return hl.codeToHtml(code, {
    lang,
    theme: CODE_THEME,
    ...(fond ? { colorReplacements: { [fond]: "transparent" } } : {}),
  });
}
