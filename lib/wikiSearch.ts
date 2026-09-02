import { normalizeForSearch } from "@/lib/wikiLinkSuggest";

/**
 * Recherche du wiki : les pages ET les fiches de notes.
 *
 * Elle ne balayait que les pages. Tout ce qu'on range dans la colonne de
 * droite — et c'est souvent le détail qu'on cherche, un nom, une date, une
 * réplique — restait introuvable : une note qu'on ne retrouve pas est une note
 * perdue.
 *
 * Le calcul est pur et sans réseau, comme il l'était : le wiki tient déjà
 * toutes ses pages en mémoire, les fiches les rejoignent.
 */

export type SearchablePage = {
  id: string;
  title: string;
  content: string | null;
  is_folder: boolean;
};

export type SearchableNote = {
  id: string;
  page_id: string;
  title: string;
  body: string;
};

export type WikiSearchHit = {
  pageId: string;
  /** La fiche trouvée, quand la correspondance vient d'une note. */
  note: { id: string; title: string } | null;
  /** Extrait autour du terme — vide quand un titre suffit à dire pourquoi. */
  excerpt: string;
};

/** Caractères montrés avant le terme trouvé, puis longueur de l'extrait. */
const BEFORE = 30;
const WINDOW = 90;

function excerptAround(text: string, at: number): string {
  const start = Math.max(0, at - BEFORE);
  return (start > 0 ? "…" : "") + text.slice(start, start + WINDOW).trim() + "…";
}

/**
 * Pages et fiches correspondant à la requête.
 *
 * Les titres passent devant les corps : quelqu'un qui tape « port » cherche
 * plus probablement la page ou la fiche qui s'appelle ainsi que le paragraphe
 * qui en parle. À rang égal, l'ordre de l'arbre puis celui des fiches
 * l'emportent — c'est celui qu'on a sous les yeux.
 */
export function searchWiki(
  pages: SearchablePage[],
  notes: SearchableNote[],
  query: string,
): WikiSearchHit[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return [];

  const parTitre: WikiSearchHit[] = [];
  const parCorps: WikiSearchHit[] = [];

  for (const page of pages) {
    if (page.is_folder) continue;

    if (normalizeForSearch(page.title).includes(q)) {
      parTitre.push({ pageId: page.id, note: null, excerpt: "" });
      continue;
    }
    const at = page.content ? normalizeForSearch(page.content).indexOf(q) : -1;
    if (at !== -1 && page.content) {
      parCorps.push({ pageId: page.id, note: null, excerpt: excerptAround(page.content, at) });
    }
  }

  for (const note of notes) {
    const entete = { pageId: note.page_id, note: { id: note.id, title: note.title } };

    if (normalizeForSearch(note.title).includes(q)) {
      parTitre.push({ ...entete, excerpt: "" });
      continue;
    }
    const at = normalizeForSearch(note.body).indexOf(q);
    if (at !== -1) parCorps.push({ ...entete, excerpt: excerptAround(note.body, at) });
  }

  return [...parTitre, ...parCorps];
}
