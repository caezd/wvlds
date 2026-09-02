/**
 * De quoi annoncer où mène un lien interne, sans l'ouvrir.
 *
 * Une page de wiki porte depuis peu une icône, un chapeau et une bannière, et
 * ces trois champs ne servaient qu'en tête de l'article. Or c'est exactement ce
 * qu'on voudrait savoir AVANT de suivre un `[[lien]]` : rien de nouveau à
 * recueillir, tout est déjà là.
 */

/** Ce qu'un aperçu a besoin de savoir d'une page. */
export type PageApercevable = {
  slug: string;
  title: string;
  icon: string | null;
  description: string | null;
  banner_url: string | null;
  is_folder: boolean;
};

export type ApercuPage = {
  title: string;
  icon: string | null;
  description: string | null;
  bannerUrl: string | null;
};

/**
 * Aperçu de la page visée par un lien, ou `null` s'il n'y a rien à montrer.
 *
 * Deux cas rendent `null`, et les deux comptent :
 *
 * - la page est introuvable. Le lien est alors déjà rendu comme cassé, et une
 *   carte vide n'ajouterait qu'une hésitation.
 * - la page n'a ni chapeau ni bannière. La carte ne dirait que son titre,
 *   c'est-à-dire le texte du lien qu'on est en train de survoler : une fenêtre
 *   qui s'ouvre pour ne rien apprendre est pire que pas de fenêtre du tout.
 */
export function apercuDeLaPage(
  pages: PageApercevable[],
  slug: string,
): ApercuPage | null {
  const page = pages.find(p => p.slug === slug && !p.is_folder);
  if (!page) return null;

  const description = page.description?.trim() || null;
  if (!description && !page.banner_url) return null;

  return {
    title: page.title,
    icon: page.icon,
    description,
    bannerUrl: page.banner_url,
  };
}
