/**
 * Ancrage d'une annotation — commentaire ou note — sur un extrait du texte
 * d'une page de wiki.
 *
 * Le problème : une annotation doit survivre à la réécriture de la page. Un
 * simple couple d'indices (début, fin) casse dès qu'un paragraphe est ajouté
 * plus haut ; l'annotation glisse alors sur un texte qui n'a plus rien à voir,
 * en silence — le pire des deux mondes, car elle a l'air valide.
 *
 * La parade retenue est celle des annotateurs du Web (sélecteurs `TextQuote` et
 * `TextPosition` de la spécification Web Annotation) : on mémorise à la fois
 * **ce qui** a été sélectionné (`quote`), **ce qui l'entoure** (`prefix` et
 * `suffix`) et **où** c'était (`start`). À la relecture :
 *
 *   1. si `start` pointe toujours sur `quote`, c'est fini — cas courant, aucun
 *      balayage du texte ;
 *   2. sinon on cherche toutes les occurrences de `quote` et on garde celle
 *      dont le voisinage ressemble le plus à `prefix`/`suffix`, la position
 *      d'origine ne servant qu'à départager deux candidates aussi crédibles ;
 *   3. si `quote` a disparu, l'annotation est déclarée détachée plutôt que
 *      raccrochée au hasard (voir `WikiAnnotationsPanel`, qui l'affiche comme
 *      telle au lieu de la masquer).
 *
 * Les offsets portent sur le **texte rendu** de la page (la concaténation des
 * nœuds texte du HTML produit par MarkdownRenderer), jamais sur la source
 * markdown : c'est ce texte-là que l'utilisateur sélectionne à l'écran, et lui
 * seul reste stable quand on change `**gras**` en `*italique*`.
 */

/** Nombre de caractères de contexte mémorisés de part et d'autre de l'extrait. */
export const ANCHOR_CONTEXT_LENGTH = 40;

/**
 * Longueur maximale d'un extrait annotable. Au-delà, la sélection n'est plus
 * un « passage » mais la moitié de la page : l'ancre perd son intérêt et le
 * surlignage devient illisible. L'interface refuse la sélection plutôt que de
 * la tronquer — tronquer déplacerait silencieusement la fin du surlignage.
 */
export const ANCHOR_MAX_QUOTE_LENGTH = 1000;

export type TextAnchor = {
  /** Texte exact sélectionné. */
  quote: string;
  /** Les `ANCHOR_CONTEXT_LENGTH` caractères qui précèdent l'extrait. */
  prefix: string;
  /** Les `ANCHOR_CONTEXT_LENGTH` caractères qui suivent l'extrait. */
  suffix: string;
  /** Position de l'extrait au moment de l'ancrage — indication, pas vérité. */
  start: number;
};

export type ResolvedRange = { start: number; end: number };

/**
 * Construit l'ancre d'une sélection. Renvoie `null` si la sélection est vide,
 * blanche, ou plus longue que `ANCHOR_MAX_QUOTE_LENGTH`.
 */
export function buildAnchor(text: string, start: number, end: number): TextAnchor | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  const from = Math.max(0, Math.min(Math.trunc(start), Math.trunc(end)));
  const to = Math.min(text.length, Math.max(Math.trunc(start), Math.trunc(end)));
  if (to <= from) return null;

  const quote = text.slice(from, to);
  if (quote.trim() === "") return null;
  if (quote.length > ANCHOR_MAX_QUOTE_LENGTH) return null;

  return {
    quote,
    prefix: text.slice(Math.max(0, from - ANCHOR_CONTEXT_LENGTH), from),
    suffix: text.slice(to, to + ANCHOR_CONTEXT_LENGTH),
    start: from,
  };
}

/** Longueur du plus long suffixe commun à `a` et `b`. */
function commonSuffixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let n = 0;
  while (n < max && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

/** Longueur du plus long préfixe commun à `a` et `b`. */
function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let n = 0;
  while (n < max && a[n] === b[n]) n++;
  return n;
}

/**
 * Part du contexte mémorisé que l'on retrouve autour de l'occurrence trouvée
 * en `index`, entre 0 (rien) et 1 (voisinage identique). Un contexte vide —
 * extrait au tout début ou à la toute fin de la page — compte pour 1 : il n'y
 * avait rien à retrouver, ce n'est pas une divergence.
 */
function contextScore(text: string, index: number, anchor: TextAnchor): number {
  const before = text.slice(Math.max(0, index - anchor.prefix.length), index);
  const afterStart = index + anchor.quote.length;
  const after = text.slice(afterStart, afterStart + anchor.suffix.length);

  const p = anchor.prefix.length === 0
    ? 1
    : commonSuffixLength(before, anchor.prefix) / anchor.prefix.length;
  const s = anchor.suffix.length === 0
    ? 1
    : commonPrefixLength(after, anchor.suffix) / anchor.suffix.length;

  return (p + s) / 2;
}

/**
 * Retrouve l'extrait d'une ancre dans `text`. Renvoie `null` quand l'extrait
 * a disparu — l'annotation est alors détachée, et c'est à l'appelant de le
 * dire à l'utilisateur.
 */
export function resolveAnchor(text: string, anchor: TextAnchor): ResolvedRange | null {
  const { quote } = anchor;
  if (!quote) return null;

  // Chemin rapide : rien n'a bougé autour de l'extrait.
  if (anchor.start >= 0 && text.startsWith(quote, anchor.start)) {
    return { start: anchor.start, end: anchor.start + quote.length };
  }

  let bestIndex = -1;
  let bestScore = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = text.indexOf(quote); i !== -1; i = text.indexOf(quote, i + 1)) {
    const score = contextScore(text, i, anchor);
    const distance = Math.abs(i - anchor.start);
    // Le contexte tranche ; la distance ne sert qu'à départager deux
    // occurrences dont le voisinage est aussi ressemblant l'un que l'autre
    // (typiquement un texte répété à l'identique, où l'ancienne position est
    // le seul indice qui reste).
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      bestIndex = i;
      bestScore = score;
      bestDistance = distance;
    }
  }

  if (bestIndex === -1) return null;
  return { start: bestIndex, end: bestIndex + quote.length };
}

/**
 * Extrait d'aperçu d'une ancre, pour la lister dans le panneau sans réclamer
 * le texte de la page. Coupe au milieu, jamais sur les bords, pour qu'on
 * reconnaisse toujours le début et la fin du passage annoté.
 */
export function anchorPreview(quote: string, maxLength = 120): string {
  if (quote.length <= maxLength) return quote;
  const half = Math.floor((maxLength - 1) / 2);
  return `${quote.slice(0, half).trimEnd()}…${quote.slice(quote.length - half).trimStart()}`;
}
