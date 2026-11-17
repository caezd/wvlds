/**
 * Chemin de la requête, transmis par le middleware aux Server Components.
 *
 * Un layout ne reçoit que les paramètres de son propre segment et de ceux
 * au-dessus. Le layout `app/(protected)/(world)/layout.tsx` se situe AU-DESSUS
 * de `w/[id]` et de `c/[id]` — c'est ce qui garde la barre latérale montée
 * d'une page de monde à un salon — et ne connaît donc ni le monde ni le salon
 * demandés : il les lit dans cet en-tête, posé par le middleware à partir de
 * l'URL (toute valeur envoyée par le client est écrasée).
 */
export const PATHNAME_HEADER = "x-wvlds-pathname";

/** Id du salon d'un chemin `/c/<id>[/…]`, sinon null. */
export function chatIdFromPathname(pathname: string | null | undefined): string | null {
  const match = /^\/c\/([^/?#]+)/.exec(pathname ?? "");
  return match ? decodeURIComponent(match[1]) : null;
}

/** Id du monde d'un chemin `/w/<id>[/…]`, sinon null. */
export function worldIdFromPathname(pathname: string | null | undefined): string | null {
  const match = /^\/w\/([^/?#]+)/.exec(pathname ?? "");
  return match ? decodeURIComponent(match[1]) : null;
}
