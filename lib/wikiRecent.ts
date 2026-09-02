/**
 * Les pages du wiki par date de dernière modification.
 *
 * `draft_updated_at` et `published_at` étaient chargés pour chaque page et ne
 * servaient à rien dans le wiki lui-même. Pour un wiki écrit à plusieurs,
 * « qu'est-ce qui a changé depuis ma dernière visite ? » est pourtant la
 * question la plus fréquente, et elle n'avait pas de réponse.
 */

export type DatedPage = {
  id: string;
  is_folder: boolean;
  draft_updated_at: string | null;
  published_at: string | null;
};

export type RecentEntry<T extends DatedPage> = {
  page: T;
  /** La date qui classe la page. */
  at: string;
  /** Un brouillon plus récent que la publication attend — éditeurs seulement. */
  hasNewerDraft: boolean;
};

/**
 * Pages classées de la plus récente à la plus ancienne.
 *
 * Un lecteur ne voit que les publications : la RLS lui cache déjà les
 * brouillons, et lui montrer leur date lui annoncerait un changement qu'il ne
 * peut pas lire. Un éditeur, lui, voit la dernière touche, publiée ou non — et
 * sait laquelle attend encore.
 *
 * Les dossiers n'ont pas de contenu, donc pas de date : ils n'y figurent pas.
 * Une page jamais publiée ni brouillonnée non plus.
 */
export function recentPages<T extends DatedPage>(pages: T[], editor: boolean): RecentEntry<T>[] {
  const entries: RecentEntry<T>[] = [];

  for (const page of pages) {
    if (page.is_folder) continue;

    const published = page.published_at;
    const draft = editor ? page.draft_updated_at : null;
    const at = [published, draft].filter((d): d is string => !!d).sort().at(-1);
    if (!at) continue;

    entries.push({
      page,
      at,
      hasNewerDraft: !!draft && (!published || draft > published),
    });
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
