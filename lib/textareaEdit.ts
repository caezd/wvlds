import { differenceMinimale } from "./markdownFormatting";

/**
 * Écrit une valeur dans un champ **par l'API d'édition du navigateur**, et non
 * par l'état React.
 *
 * C'est ce qui rend l'annulation possible. Un `<textarea>` contrôlé garde la
 * pile d'annulation native tant que personne n'écrit dans sa valeur : la
 * frappe s'y empile toute seule. Mais une valeur posée par React remplace la
 * propriété `value` du nœud, ce qui **vide** cette pile — après une mise en
 * forme, Ctrl+Z n'avait donc plus rien à défaire, et ne défaisait pas non plus
 * ce qui avait été tapé avant.
 *
 * En passant par `execCommand`, le navigateur inscrit lui-même la modification
 * dans sa pile et émet un événement `input` : React apprend la nouvelle valeur
 * par son `onChange` habituel, et Ctrl+Z défait une mise en forme comme il
 * défait une frappe — regroupement des saisies compris, ce qu'une pile écrite
 * à la main imiterait mal.
 *
 * `execCommand` est marquée obsolète, sans remplacement pour cet usage :
 * aucune autre API n'écrit dans un champ en préservant l'annulation. D'où le
 * retour booléen — l'appelant retombe sur l'écriture par l'état quand elle
 * manque (jsdom) ou refuse.
 */
export function ecrireAvecAnnulation(champ: HTMLTextAreaElement, valeur: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;

  const { debut, fin, texte } = differenceMinimale(champ.value, valeur);
  if (debut === fin && texte === "") return true;

  // Le champ doit avoir le focus pour recevoir une commande d'édition, et il
  // ne l'a pas toujours : une entrée de menu, elle, le lui a pris.
  champ.focus();
  champ.setSelectionRange(debut, fin);

  try {
    return texte === ""
      ? document.execCommand("delete")
      : document.execCommand("insertText", false, texte);
  } catch {
    return false;
  }
}
