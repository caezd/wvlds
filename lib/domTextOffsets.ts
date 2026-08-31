/**
 * Passage entre une sélection à l'écran et des offsets de caractères dans le
 * texte rendu d'un élément — l'unité d'ancrage des annotations du wiki (voir
 * `lib/wikiAnnotations.ts`).
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

import type { ResolvedRange } from "@/lib/wikiAnnotations";

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

function intersects(range: Range, node: Text): boolean {
  // `intersectsNode` fait partie de la spécification Range, mais reste absent
  // de quelques implémentations — d'où la comparaison de bornes en repli.
  if (typeof range.intersectsNode === "function") return range.intersectsNode(node);
  const own = node.ownerDocument.createRange();
  own.selectNodeContents(node);
  return (
    range.compareBoundaryPoints(Range.END_TO_START, own) <= 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, own) >= 0
  );
}

/**
 * Offsets couverts par une sélection. Quand une borne tombe sur un élément
 * plutôt que sur un nœud texte — ce que produit un triple-clic, qui sélectionne
 * le paragraphe entier — on la rabat sur le premier (ou le dernier) nœud texte
 * que la plage traverse. Renvoie `null` si la sélection ne touche aucun texte.
 */
export function offsetsFromRange(root: Element, range: Range): ResolvedRange | null {
  const nodes = collectTextNodes(root);

  let start: number | null = null;
  let end: number | null = null;
  let firstTouched: number | null = null;
  let lastTouched: number | null = null;
  let offset = 0;

  for (const node of nodes) {
    const length = node.nodeValue!.length;
    if (node === range.startContainer) start = offset + Math.min(range.startOffset, length);
    if (node === range.endContainer) end = offset + Math.min(range.endOffset, length);
    if (intersects(range, node)) {
      if (firstTouched === null) firstTouched = offset;
      lastTouched = offset + length;
    }
    offset += length;
  }

  if (start === null) start = firstTouched;
  if (end === null) end = lastTouched;
  if (start === null || end === null || end <= start) return null;
  return { start, end };
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

/**
 * Plage DOM correspondant à `[start, end)` — pour mesurer la position à
 * l'écran du passage annoté (`getBoundingClientRect`) ou le faire défiler en vue.
 */
export function rangeForOffsets(root: Element, start: number, end: number): Range | null {
  const slices = slicesForOffsets(root, start, end);
  if (slices.length === 0) return null;
  const range = root.ownerDocument.createRange();
  const first = slices[0];
  const last = slices[slices.length - 1];
  range.setStart(first.node, first.start);
  range.setEnd(last.node, last.end);
  return range;
}

/**
 * Enveloppe chaque portion dans un `<span>` et renvoie les span posés.
 *
 * Contrat d'usage : ces `<span>` sont invisibles pour React, qui n'en sait
 * rien. Ils ne sont donc sûrs que si l'arbre qui les héberge est **remonté**
 * (`key`) plutôt que mis à jour dès que son contenu change — sinon React
 * tenterait de retirer un nœud texte dont le parent n'est plus celui qu'il
 * connaît. Voir `useAnnotationHighlights`.
 *
 * Le découpage préserve le nœud d'origine en tête : `splitText` laisse le
 * début dans le nœud existant et crée les nœuds suivants. Celui que React
 * référence reste donc toujours le premier de la fratrie, celui qu'un
 * `normalize()` conserverait.
 */
export function wrapSlices(
  slices: TextSlice[],
  decorate: (span: HTMLSpanElement) => void,
): HTMLSpanElement[] {
  const spans: HTMLSpanElement[] = [];

  for (const slice of slices) {
    const { node } = slice;
    const length = node.nodeValue?.length ?? 0;
    if (slice.end <= slice.start || slice.start >= length) continue;

    // La queue d'abord : couper par la fin laisse les offsets du début justes.
    if (slice.end < length) node.splitText(slice.end);
    const target = slice.start > 0 ? node.splitText(slice.start) : node;

    const parent = target.parentNode;
    if (!parent) continue;

    const span = target.ownerDocument.createElement("span");
    decorate(span);
    parent.insertBefore(span, target);
    span.appendChild(target);
    spans.push(span);
  }

  return spans;
}
