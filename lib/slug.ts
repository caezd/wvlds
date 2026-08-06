/** Slug ASCII à partir d'un titre — utilisé pour les slugs de page wiki et les ancres de sommaire. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "page"
  );
}
