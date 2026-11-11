/**
 * Chemin de la requête, transmis par le middleware aux Server Components.
 *
 * Un layout ne reçoit que les paramètres de son propre segment et de ceux
 * au-dessus. Le layout `app/(protected)/c/layout.tsx` se situe AU-DESSUS de
 * `[id]` — c'est ce qui le garde monté d'un salon à l'autre — et ne connaît
 * donc pas le salon demandé : il le lit dans cet en-tête, posé par le
 * middleware à partir de l'URL (toute valeur envoyée par le client est
 * écrasée).
 */
export const PATHNAME_HEADER = "x-wvlds-pathname";

/** Id du salon d'un chemin `/c/<id>[/…]`, sinon null. */
export function chatIdFromPathname(pathname: string | null | undefined): string | null {
  const match = /^\/c\/([^/?#]+)/.exec(pathname ?? "");
  return match ? decodeURIComponent(match[1]) : null;
}
