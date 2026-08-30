/**
 * Codes d'erreur des actions serveur, et leur traduction côté client.
 *
 * ── Le problème ──────────────────────────────────────────────
 * Les actions serveur renvoyaient `{ error: "Police non supportée" }` — une
 * phrase française codée en dur — et 35 endroits l'affichent telle quelle dans
 * une notification. Une personne lisant l'application en anglais ou en espagnol
 * recevait donc un message en français.
 *
 * Pire : quand l'erreur venait de la base, c'est `error.message` de PostgreSQL
 * qui s'affichait — « new row violates row-level security policy for table… ».
 * Illisible, et cela expose le nom des tables et des règles.
 *
 * ── Le principe ──────────────────────────────────────────────
 * Une action renvoie un CODE stable, jamais une phrase. Le client le traduit.
 * Tout code inconnu — c'est-à-dire tout message brut de la base — retombe sur
 * un message générique traduit : l'information technique reste côté serveur,
 * où elle est utile, et ne remonte pas à l'écran, où elle ne l'est pas.
 */

/** La session n'est plus valide. Seul cas où l'utilisateur peut agir. */
export const ERR_NON_AUTHENTIFIE = "unauthenticated";

/**
 * Valeur refusée par la liste blanche de l'action.
 *
 * N'arrive pas au cours d'un usage normal — l'interface ne propose que des
 * valeurs valides. C'est une garde contre un client modifié, pas un message à
 * expliquer : il retombe donc sur le message générique.
 */
export const ERR_VALEUR_NON_SUPPORTEE = "unsupportedValue";

/** L'écriture a échoué côté base. Le détail reste dans les journaux serveur. */
export const ERR_ENREGISTREMENT = "saveFailed";

/**
 * Message à afficher pour un code d'erreur d'action.
 *
 * @param code ce que l'action a renvoyé — un code, ou n'importe quoi d'autre
 * @param t    `useTranslations("common")`
 */
export function messageErreurAction(
  code: string | undefined | null,
  t: (cle: string) => string,
): string {
  if (code === ERR_NON_AUTHENTIFIE) return t("sessionExpired");
  return t("saveError");
}
