/**
 * Texte rendu d'un élément, et passage de ses offsets de caractères aux nœuds
 * qui les portent.
 *
 * Ne sert plus qu'aux commentaires écrits avant la migration 142, du temps où
 * l'on ancrait une sélection de caractères : ils se résolvent ainsi, puis on
 * remonte au bloc qui les contient. Les nouveaux visent un bloc directement
 * (`lib/domBlocks.ts`, `lib/wikiBlockAnchors.ts`).
 *
 * Le « texte rendu » d'un élément est la concaténation, dans l'ordre du
 * document, de ses nœuds texte. Deux exclusions :
 *
 * - tout ce qui porte `data-annotate-ignore` — en pratique le bouton « Copier »
 *   des blocs de code, dont le libellé bascule en « Copié » au clic : sans
 *   cette exclusion, toutes les annotations situées après un bloc de code
 *   glisseraient d'un caractère à chaque copie ;
 * - `<script>` et `<style>`, qui n'affichent rien.
 */

/** Portion d'un nœud texte couverte par une plage d'offsets. */
export type TextSlice = { node: Text; start: number; end: number };

const IGNORE_SELECTOR = "[data-annotate-ignore]";

/** Nœuds texte d'un élément, dans l'ordre du document, exclusions appliquées. */
export function collectTextNodes(root: Element): Text[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") return NodeFilter.FILTER_REJECT;
      if (parent.closest(IGNORE_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes;
}

/** Texte rendu de l'élément — la chaîne sur laquelle portent tous les offsets. */
export function getPlainText(root: Element): string {
  let out = "";
  for (const n of collectTextNodes(root)) out += n.nodeValue;
  return out;
}


/** Portions de nœuds texte couvertes par `[start, end)`. */
export function slicesForOffsets(root: Element, start: number, end: number): TextSlice[] {
  if (end <= start) return [];
  const slices: TextSlice[] = [];
  let offset = 0;

  for (const node of collectTextNodes(root)) {
    const length = node.nodeValue!.length;
    const nodeEnd = offset + length;
    if (nodeEnd > start && offset < end) {
      slices.push({
        node,
        start: Math.max(0, start - offset),
        end: Math.min(length, end - offset),
      });
    }
    offset = nodeEnd;
    if (offset >= end) break;
  }

  return slices;
}
