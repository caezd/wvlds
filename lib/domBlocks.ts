import { normaliserTexte } from "./wikiBlockAnchors";

/**
 * Découpe du texte rendu d'un article en **blocs** commentables.
 *
 * Le découpage se lit sur le rendu et non sur le markdown : c'est le rendu que
 * l'utilisateur désigne, et il est déjà là. Un élément de liste y est un bloc
 * au même titre qu'un paragraphe, sans traitement particulier.
 */

/** Éléments qui portent un bloc de texte à part entière. */
export const BLOCK_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, td";

const IGNORE_SELECTOR = "[data-annotate-ignore]";

export type BlocDOM = { el: HTMLElement; type: string; text: string };

/**
 * Texte propre à un élément : celui de ses nœuds texte et de ses descendants
 * qui ne sont pas eux-mêmes des blocs.
 *
 * C'est ce qui permet à `<li>a<ul><li>b</li></ul></li>` de compter pour deux
 * blocs, « a » et « b », plutôt que pour un bloc « ab » et son doublon. Un
 * `<blockquote><p>…</p></blockquote>` n'a, lui, aucun texte propre : seul le
 * paragraphe est retenu, et la citation disparaît d'elle-même de la liste.
 */
function textePropre(el: Element): string {
  let sortie = "";
  for (const noeud of Array.from(el.childNodes)) {
    if (noeud.nodeType === 3) { sortie += noeud.nodeValue ?? ""; continue; }
    if (noeud.nodeType !== 1) continue;

    const enfant = noeud as Element;
    const tag = enfant.tagName;
    if (tag === "SCRIPT" || tag === "STYLE") continue;
    if (enfant.matches(BLOCK_SELECTOR)) continue;
    if (enfant.matches(IGNORE_SELECTOR)) continue;
    sortie += textePropre(enfant);
  }
  return sortie;
}

/**
 * Blocs du rendu, dans l'ordre de lecture.
 *
 * L'index d'un bloc dans cette liste est l'unité que manipulent les ancres
 * (`lib/wikiBlockAnchors.ts`) : les deux découpages doivent donc être le même,
 * d'où cette fonction unique appelée aussi bien pour ancrer que pour résoudre.
 */
export function collectBlocks(root: Element): BlocDOM[] {
  const blocs: BlocDOM[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))) {
    if (el.closest(IGNORE_SELECTOR)) continue;
    const text = normaliserTexte(textePropre(el));
    if (!text) continue;
    blocs.push({ el, type: el.tagName.toLowerCase(), text });
  }
  return blocs;
}

/** Index du bloc qui contient ce nœud, ou `-1` — sert aux anciennes ancres. */
export function blockIndexOfNode(blocs: BlocDOM[], node: Node): number {
  const depart = node.nodeType === 1 ? (node as Element) : node.parentElement;
  // `closest` rend le bloc le plus proche : un `<li>` imbriqué l'emporte sur
  // celui qui le contient, comme au découpage.
  const bloc = depart?.closest(BLOCK_SELECTOR);
  return bloc ? blocs.findIndex(b => b.el === bloc) : -1;
}
