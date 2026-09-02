/**
 * Où se trouve le curseur d'un champ de texte, en pixels.
 *
 * Un `<textarea>` ne le dit pas : il ne donne qu'un index de caractère, et
 * aucune API ne le convertit en position. Il faut donc un miroir — un bloc
 * invisible qui porte le même texte avec exactement les mêmes réglages de
 * rendu — et lire où le navigateur y a posé le caractère visé.
 *
 * Sert à poser une liste de suggestions sous la ligne qu'on écrit, plutôt que
 * dans un coin de l'écran où l'œil devrait aller la chercher.
 */

/**
 * Réglages qui décident du placement du texte.
 *
 * Il en manque un et le miroir décroche : une graisse différente, une
 * gouttière oubliée, et la liste se pose une ligne trop haut ou vingt pixels
 * trop à gauche.
 */
const PROPERTIES = [
  "box-sizing",
  "border-bottom-width",
  "border-left-width",
  "border-right-width",
  "border-top-width",
  "font-family",
  "font-size",
  "font-stretch",
  "font-style",
  "font-variant",
  "font-weight",
  "letter-spacing",
  "line-height",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "tab-size",
  "text-indent",
  "text-transform",
  "word-spacing",
] as const;

export type CaretPosition = {
  /** Depuis le haut de la boîte du champ, défilement déduit. */
  top: number;
  /** Depuis la gauche de la boîte du champ. */
  left: number;
  /** Hauteur d'une ligne — de quoi poser quelque chose SOUS le curseur. */
  lineHeight: number;
};

export function getCaretPosition(
  field: HTMLTextAreaElement,
  index: number,
): CaretPosition {
  const style = getComputedStyle(field);

  const mirror = document.createElement("div");
  for (const p of PROPERTIES) mirror.style.setProperty(p, style.getPropertyValue(p));
  // Hors du flux et hors de vue : le miroir ne doit rien déplacer ni rien
  // montrer, seulement se faire mesurer.
  mirror.style.position = "absolute";
  mirror.style.top = "0";
  mirror.style.left = "0";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.width = `${field.clientWidth}px`;
  mirror.textContent = field.value.slice(0, index);

  // La suite du texte va dans un repère : c'est SA position qui nous
  // intéresse. Elle doit être non vide, sans quoi elle n'occupe aucune place
  // et le navigateur n'a rien à mesurer.
  const marker = document.createElement("span");
  marker.textContent = field.value.slice(index) || ".";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  const left = marker.offsetLeft;
  const lineHeight = parseFloat(style.lineHeight) || marker.offsetHeight;
  mirror.remove();

  return { top: top - field.scrollTop, left: left - field.scrollLeft, lineHeight };
}
