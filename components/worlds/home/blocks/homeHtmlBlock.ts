import { fromHtml } from "hast-util-from-html";
import { sanitize, type Schema } from "hast-util-sanitize";
import type { Element, Root, RootContent } from "hast";

/**
 * Préparation d'un bloc HTML libre de la page d'accueil d'un monde, pour un
 * rendu DANS la page (plus d'iframe).
 *
 * Le contenu est écrit par un admin de monde et rendu à tous ses membres :
 * n'importe qui peut créer un monde et y inviter des gens. Une exécution de
 * JS ici donnerait accès à la session Supabase de la victime — donc à son
 * compte. Sans le bac à sable de l'iframe, c'est ce module qui porte cette
 * garantie, en trois temps :
 *
 *  1. LISTE BLANCHE, jamais liste noire. Interdire `<script>` et une liste de
 *     gestionnaires ne tient pas : il existe une centaine d'attributs `on*`,
 *     la spec en ajoute à chaque version, et `xlink:href="javascript:…"` ne
 *     contient pas le mot « script » là où on le chercherait. Ici, tout ce qui
 *     n'est pas explicitement listé disparaît — y compris ce qui n'existe pas
 *     encore au moment où ces lignes sont écrites.
 *  2. RENDU PAR REACT, pas par `dangerouslySetInnerHTML` (voir
 *     WorldHomeHtmlBlockView) : c'est React qui construit les nœuds depuis
 *     l'arbre assaini. Un attribut `on*` qui franchirait la liste blanche
 *     serait une chaîne posée sur un élément, pas un gestionnaire.
 *  3. AU RENDU, pas seulement à l'enregistrement. Le contenu déjà en base a
 *     été écrit du temps de l'iframe, où le JS ne s'exécutait jamais : il peut
 *     parfaitement contenir un `<script>` inerte. Assainir uniquement à
 *     l'écriture le réveillerait.
 */

/**
 * Balises autorisées. Le schéma n'étend délibérément pas `defaultSchema` de
 * hast-util-sanitize : celui-ci vise le rendu d'un README GitHub (il autorise
 * par exemple `input` pour les cases à cocher). Sur une frontière de sécurité,
 * une liste explicite se relit — et se révise — sans avoir à dérouler ce dont
 * elle hérite.
 *
 * Absents volontairement : `script`, `style` (le CSS a son propre champ, et
 * son contenu est hissé ici même), `link`, `meta`, `base`, `iframe`, `object`,
 * `embed`, `form` et les champs de saisie, `svg` (dont `xlink:href` accepte
 * `javascript:` et `foreignObject` réintroduit du HTML arbitraire), `canvas`,
 * `template`, `slot`, `noscript`.
 */
const ALLOWED_TAGS = [
  "div", "section", "article", "aside", "header", "footer", "nav",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "span", "strong", "em", "b", "i", "u", "s", "del", "ins", "mark", "small",
  "sub", "sup", "code", "pre", "kbd", "samp", "var", "abbr", "q", "blockquote",
  "cite", "time", "br", "hr", "a",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "img", "figure", "figcaption",
];

/**
 * `id` n'est PAS autorisé : un bloc pourrait sinon poser `id="thread"` ou
 * `id="app-shell"` (voir AppShell.tsx) et détourner un `getElementById` de
 * l'application, ou faire apparaître une propriété du même nom sur `window`
 * (DOM clobbering). Le style se cible par classe, ce qui suffit.
 *
 * `style` est autorisé : c'est l'attente légitime d'un bloc « HTML libre », et
 * le CSS n'exécute pas de JS. Son seul pouvoir de nuisance — sortir de la
 * boîte du bloc — est neutralisé par le `contain: layout` de l'hôte.
 */
const SCHEMA: Schema = {
  tagNames: ALLOWED_TAGS,
  attributes: {
    "*": ["className", "style", "title", "lang", "dir"],
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height", "loading", "decoding"],
    td: ["colSpan", "rowSpan", "headers"],
    th: ["colSpan", "rowSpan", "headers", "scope", "abbr"],
    col: ["span"],
    colgroup: ["span"],
    time: ["dateTime"],
    blockquote: ["cite"],
    q: ["cite"],
    ol: ["start", "reversed", "type"],
    li: ["value"],
  },
  // `data:` est absent de `src` : `data:text/html` y ferait rentrer du HTML
  // arbitraire par une porte dérobée.
  protocols: {
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
    cite: ["http", "https"],
  },
  strip: ["script", "style"],
  clobber: [],
  clobberPrefix: "",
  ancestors: {},
  required: {},
};

/**
 * Classe d'isolement d'un bloc, dérivée de son id. Les ids viennent de
 * `crypto.randomUUID()` mais peuvent être n'importe quelle chaîne en base :
 * on ne garde que ce qui est valide dans un sélecteur de classe, et on
 * préfixe — un identifiant CSS ne peut pas commencer par un chiffre.
 */
export function blockScopeClass(id: string): string {
  return `wvlds-hb-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

/**
 * Neutralise la seule évasion possible depuis l'intérieur d'une balise
 * `<style>` : la séquence `</`, qui refermerait l'élément et laisserait la
 * suite être analysée comme du balisage. Aucune feuille de style valide n'en
 * a besoin — la remplacer est sans effet de bord.
 */
export function neutralizeStyleClose(css: string): string {
  return css.replace(/<\//g, "<\\/");
}

/**
 * Enferme la feuille de style dans le sous-arbre du bloc via `@scope`, pour
 * qu'aucun sélecteur ne puisse atteindre le reste de l'application.
 *
 * L'isolement est à SENS UNIQUE, contrairement à ce qu'offrirait un Shadow
 * DOM : les styles de l'application continuent d'atteindre l'intérieur du
 * bloc. C'est voulu — c'est ce qui fait qu'un bloc se fond dans la page
 * (typographie, couleurs) au lieu de repartir des styles par défaut du
 * navigateur, comme le faisait l'iframe.
 *
 * Dans ce cadre, `:scope` désigne le bloc lui-même. Un sélecteur `body` ou
 * `html` ne correspond donc à rien : il n'y a pas de `body` sous le bloc.
 */
export function scopeBlockCss(css: string, scopeClass: string): string {
  const trimmed = css.trim();
  if (!trimmed) return "";
  return `@scope (.${scopeClass}) {\n${neutralizeStyleClose(trimmed)}\n}`;
}

/**
 * Retire les éléments `<style>` de l'arbre et rend leur contenu à part.
 *
 * Avant l'existence d'un champ CSS dédié, un bloc HTML portait sa feuille de
 * style en plein milieu de son HTML — c'est le cas de tous les blocs déjà
 * enregistrés. Les hisser ici plutôt que de les laisser tomber sous la liste
 * blanche (qui les supprimerait) préserve leur apparence, et les fait passer
 * par le même `@scope` que le champ dédié : ils ne peuvent pas non plus fuir
 * vers le reste de la page. Rien n'est réécrit en base.
 */
function hoistStyleElements(nodes: RootContent[], collected: string[]): RootContent[] {
  const kept: RootContent[] = [];
  for (const node of nodes) {
    if (node.type === "element" && node.tagName === "style") {
      for (const child of node.children) {
        if (child.type === "text") collected.push(child.value);
      }
      continue;
    }
    if (node.type === "element") {
      kept.push({ ...node, children: hoistStyleElements(node.children, collected) } as Element);
      continue;
    }
    kept.push(node);
  }
  return kept;
}

/**
 * Prépare un bloc pour l'affichage : arbre assaini d'un côté, feuille de style
 * scopée de l'autre. Fonction pure, sans dépendance au DOM — elle tourne aussi
 * bien au rendu serveur que dans l'aperçu de l'éditeur, et se teste seule.
 */
export function prepareHomeHtmlBlock({
  html,
  css,
  scopeClass,
}: {
  html: string;
  css?: string;
  scopeClass: string;
}): { tree: Root; css: string } {
  const parsed = fromHtml(html, { fragment: true });
  const hoisted: string[] = [];
  const withoutStyles: Root = { ...parsed, children: hoistStyleElements(parsed.children, hoisted) };
  const tree = sanitize(withoutStyles, SCHEMA) as Root;

  // Le champ dédié passe en dernier : à règles de même poids, il l'emporte sur
  // une feuille héritée de l'ancien format, ce qui permet de corriger un bloc
  // existant sans avoir à démonter son HTML.
  const merged = [...hoisted, css ?? ""].map((part) => part.trim()).filter(Boolean).join("\n\n");

  return { tree, css: scopeBlockCss(merged, scopeClass) };
}
