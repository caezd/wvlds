import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * Coloration syntaxique des champs de code de l'application (aujourd'hui : les
 * blocs HTML et Markdown de la page d'accueil d'un monde).
 *
 * Assemblage à la carte plutôt que le paquet `shiki` complet : celui-ci
 * référence ~200 grammaires, que l'empaqueteur transforme en autant de
 * fragments. On ne déclare ici que ce qu'on colore réellement.
 *
 * Moteur d'expressions régulières JavaScript, et non le moteur Oniguruma :
 * ce dernier est un binaire WebAssembly de plusieurs centaines de kilooctets,
 * démesuré pour trois grammaires. `forgiving` laisse tomber les rares motifs
 * qu'il ne sait pas traduire au lieu de refuser la grammaire entière : au pire
 * un fragment reste non coloré, ce qui est sans conséquence pour un champ de
 * saisie.
 */
export const CODE_THEME = "vesper";

export type CodeLanguage = "html" | "css" | "markdown";

/**
 * Une grammaire par langage, chargée séparément.
 *
 * Elles pèsent une soixantaine de kilooctets chacune. Les déclarer toutes à la
 * création de l'instance — ce que faisait ce module — les téléchargeait toutes
 * dès le premier champ de code, alors qu'un onglet donné n'en emploie qu'une :
 * ouvrir l'onglet HTML payait aussi le CSS et le Markdown.
 */
const GRAMMAIRES: Record<CodeLanguage, () => Promise<unknown>> = {
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  markdown: () => import("@shikijs/langs/markdown"),
};

/** Instance partagée : plusieurs champs ouverts dans la même page se la
 *  partagent, et une page qui n'en ouvre aucun ne télécharge rien. */
let coeur: Promise<HighlighterCore> | null = null;

function getCoeur(): Promise<HighlighterCore> {
  coeur ??= createHighlighterCore({
    themes: [import("@shikijs/themes/vesper")],
    // Aucune grammaire d'emblée : chacune arrive avec le premier champ qui en
    // a besoin (voir `chargerGrammaire`).
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return coeur;
}

/** Chargements en cours ou terminés, mémoïsés par langage : deux champs du même
 *  langage montés en même temps ne doivent pas télécharger deux fois. */
const grammairesChargées = new Map<CodeLanguage, Promise<void>>();

function chargerGrammaire(hl: HighlighterCore, lang: CodeLanguage): Promise<void> {
  let chargement = grammairesChargées.get(lang);
  if (!chargement) {
    chargement = GRAMMAIRES[lang]().then(async (mod) => {
      await hl.loadLanguage(mod as Parameters<HighlighterCore["loadLanguage"]>[0]);
    });
    grammairesChargées.set(lang, chargement);
  }
  return chargement;
}

/**
 * Lance le téléchargement sans attendre le résultat.
 *
 * Le fragment ne partait jusqu'ici qu'à l'ouverture du tiroir, c'est-à-dire au
 * moment précis où l'on a besoin du résultat : le champ s'affichait donc en
 * texte brut le temps du transfert. Appelé en amont — dès que l'éditeur de
 * grille est à l'écran — le transfert a lieu pendant que l'admin lit sa page,
 * et le champ est coloré dès son premier rendu.
 */
export function preloadCodeHighlighter(lang: CodeLanguage = "html"): void {
  void getCoeur()
    .then((hl) => chargerGrammaire(hl, lang))
    // Un préchargement qui échoue ne doit rien casser : le champ retombera sur
    // sa couche de repli, et retentera son propre chargement.
    .catch(() => {});
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
  const hl = await getCoeur();
  await chargerGrammaire(hl, lang);
  const fond = hl.getTheme(CODE_THEME).bg;
  return hl.codeToHtml(code, {
    lang,
    theme: CODE_THEME,
    ...(fond ? { colorReplacements: { [fond]: "transparent" } } : {}),
  });
}
