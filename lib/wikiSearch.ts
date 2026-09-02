import { normalizeForSearch } from "@/lib/wikiLinkSuggest";

/**
 * Recherche du wiki : les pages ET les fiches de notes.
 *
 * Elle ne balayait que les pages. Tout ce qu'on range dans la colonne de
 * droite — et c'est souvent le détail qu'on cherche, un nom, une date, une
 * réplique — restait introuvable : une note qu'on ne retrouve pas est une note
 * perdue.
 *
 * ── L'index se construit une fois, la recherche le lit ──
 * Normaliser un texte — décomposition NFD, puis une expression sur chaque
 * diacritique — coûte bien plus que d'y chercher une sous-chaîne. La première
 * version le refaisait sur le contenu de CHAQUE page et le corps de CHAQUE
 * fiche à chaque caractère tapé : plusieurs centaines de kilo-octets retraités
 * par touche sur un monde fourni. Le texte ne change pas entre deux frappes ;
 * on le normalise donc quand il change, et seule la requête l'est ensuite.
 *
 * Le calcul reste pur et sans réseau : le wiki tient déjà toutes ses pages en
 * mémoire, les fiches les rejoignent.
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

type IndexedPage = {
  id: string;
  content: string;
  normalizedTitle: string;
  normalizedContent: string;
};

type IndexedNote = {
  id: string;
  pageId: string;
  title: string;
  body: string;
  normalizedTitle: string;
  normalizedBody: string;
};

export type WikiSearchIndex = {
  pages: IndexedPage[];
  notes: IndexedNote[];
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

/**
 * Prépare pages et fiches à la recherche. À refaire quand elles changent,
 * jamais quand la requête change.
 *
 * Les dossiers en sont écartés d'emblée : ils n'ont rien à ouvrir.
 */
export function buildSearchIndex(
  pages: SearchablePage[],
  notes: SearchableNote[],
): WikiSearchIndex {
  return {
    pages: pages
      .filter(p => !p.is_folder)
      .map(p => ({
        id: p.id,
        content: p.content ?? "",
        normalizedTitle: normalizeForSearch(p.title),
        normalizedContent: normalizeForSearch(p.content ?? ""),
      })),
    notes: notes.map(n => ({
      id: n.id,
      pageId: n.page_id,
      title: n.title,
      body: n.body,
      normalizedTitle: normalizeForSearch(n.title),
      normalizedBody: normalizeForSearch(n.body),
    })),
  };
}

/**
 * L'extrait se prend dans le texte d'origine, à l'index trouvé dans le texte
 * normalisé. Les deux coïncident tant que la normalisation ne change pas la
 * longueur — c'est le cas : elle abaisse la casse et retire des diacritiques
 * décomposés, sans insérer ni fusionner de caractère de base.
 */
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
export function searchWiki(index: WikiSearchIndex, query: string): WikiSearchHit[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return [];

  const byTitle: WikiSearchHit[] = [];
  const byBody: WikiSearchHit[] = [];

  for (const page of index.pages) {
    if (page.normalizedTitle.includes(q)) {
      byTitle.push({ pageId: page.id, note: null, excerpt: "" });
      continue;
    }
    const at = page.normalizedContent.indexOf(q);
    if (at !== -1) {
      byBody.push({ pageId: page.id, note: null, excerpt: excerptAround(page.content, at) });
    }
  }

  for (const note of index.notes) {
    const head = { pageId: note.pageId, note: { id: note.id, title: note.title } };

    if (note.normalizedTitle.includes(q)) {
      byTitle.push({ ...head, excerpt: "" });
      continue;
    }
    const at = note.normalizedBody.indexOf(q);
    if (at !== -1) byBody.push({ ...head, excerpt: excerptAround(note.body, at) });
  }

  return [...byTitle, ...byBody];
}
