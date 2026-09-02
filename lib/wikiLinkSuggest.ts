/**
 * Autocomplétion des liens internes `[[Titre]]`, pendant qu'on écrit.
 *
 * La syntaxe existait déjà (`lib/wikiLinks.ts`) mais il fallait connaître le
 * titre exact et le taper sans faute : un lien vers une page dont on n'est pas
 * sûr coûtait un aller-retour dans l'arbre. On reliait donc « plus tard », et
 * les pages restaient isolées. Proposer les titres au fil de la frappe, c'est
 * ce qui fait qu'un wiki se tisse au moment où on l'écrit.
 *
 * Tout est pur ici : l'appelant lit le curseur de son champ, demande ce qu'il
 * y a à proposer, puis réécrit la valeur. Les règles se vérifient donc sans
 * champ réel — c'est ce qui permet de tester les cas tordus (un `[[` déjà
 * fermé, un crochet isolé, un titre à cheval sur deux lignes).
 */

/** Normalise pour une comparaison insensible à la casse et aux diacritiques. */
export function normaliserPourRecherche(input: string): string {
  return input.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export type LienEnCours = {
  /** Index du premier caractère du titre, juste après `[[`. */
  debut: number;
  /** Ce qui a été tapé depuis. */
  requete: string;
};

const OUVERTURE = "[[";

/**
 * Plus long titre qu'on accepte de considérer comme en cours de frappe.
 *
 * Au-delà, ce `[[` traîne depuis longtemps sur la ligne et n'est plus celui
 * qu'on écrit : mieux vaut ne rien proposer que de suivre un faux départ.
 */
const TITRE_MAX = 80;

/**
 * Le `[[` ouvert avant le curseur, et ce qui a été tapé depuis — ou `null`.
 *
 * La recherche ne franchit pas le début de ligne : un titre de page ne
 * s'écrit pas sur deux lignes, et remonter tout le document ferait s'ouvrir la
 * liste au moindre crochet oublié plus haut.
 */
export function lienEnCours(texte: string, curseur: number): LienEnCours | null {
  const debutDeLigne = texte.lastIndexOf("\n", curseur - 1) + 1;
  const avant = texte.slice(debutDeLigne, curseur);

  const ouverture = avant.lastIndexOf(OUVERTURE);
  if (ouverture === -1) return null;

  const requete = avant.slice(ouverture + OUVERTURE.length);
  // Un crochet dans la requête, ouvrant ou fermant, dit que ce `[[` n'est plus
  // celui qu'on est en train d'écrire.
  if (requete.length > TITRE_MAX || /[[\]]/.test(requete)) return null;

  return { debut: debutDeLigne + ouverture + OUVERTURE.length, requete };
}

/**
 * Pages à proposer pour cette requête, les plus pertinentes d'abord.
 *
 * Les dossiers en sont écartés : un lien vers un dossier ne mène à rien, le
 * wiki n'ouvrant que des pages. Un titre qui COMMENCE par ce qu'on tape passe
 * devant un titre qui le contient au milieu, et à égalité le plus court gagne
 * — c'est presque toujours celui qu'on visait.
 */
export function pagesProposees<T extends { title: string; is_folder: boolean }>(
  pages: T[],
  requete: string,
  max = 8,
): T[] {
  const q = normaliserPourRecherche(requete.trim());

  return pages
    .filter(p => !p.is_folder)
    .map(p => ({ page: p, place: normaliserPourRecherche(p.title).indexOf(q) }))
    .filter(({ place }) => place !== -1)
    .sort((a, b) => a.place - b.place || a.page.title.localeCompare(b.page.title))
    .slice(0, max)
    .map(({ page }) => page);
}

/**
 * Texte et curseur après avoir accepté un titre.
 *
 * Le `]]` fermant n'est posé que s'il manque : on complète souvent au milieu
 * d'un lien déjà fermé, et le doubler laisserait `[[Titre]]]]`.
 */
export function completerLien(
  texte: string,
  debut: number,
  curseur: number,
  titre: string,
): { value: string; curseur: number } {
  const dejaFerme = texte.startsWith("]]", curseur);

  return {
    value: texte.slice(0, debut) + titre + (dejaFerme ? "" : "]]") + texte.slice(curseur),
    // Après le `]]`, qu'il vienne d'être posé ou qu'il fût déjà là : on
    // continue d'écrire la phrase, pas le lien.
    curseur: debut + titre.length + 2,
  };
}
