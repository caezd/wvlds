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

import { FREE_PERSONAS_PER_WORLD } from "@/lib/personaQuotaConstants";

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
 * L'objet visé n'existe pas, ou n'appartient pas à qui le demande.
 *
 * Les deux cas sont volontairement confondus : les distinguer révélerait
 * l'existence d'un objet auquel on n'a pas accès.
 */
export const ERR_INTROUVABLE = "notFound";

/** L'action demande un rôle que l'appelant n'a pas. */
export const ERR_NON_AUTORISE = "forbidden";

/** Étiquette de monde vide ou contenant autre chose que lettres et chiffres. */
export const ERR_TAG_INVALIDE = "invalidTag";

/** Le quota de personnages du plan gratuit est atteint pour ce monde. */
export const ERR_QUOTA_PERSONAS = "personaQuotaReached";

/** Trop de signalements déposés dans l'heure — voir la migration 140. */
export const ERR_RYTHME_SIGNALEMENTS = "bugReportRateLimit";

/** Le pseudo choisi est déjà porté par quelqu'un d'autre. */
export const ERR_NOM_UTILISATEUR_PRIS = "usernameTaken";

/** Un personnage du même nom existe déjà dans ce monde. */
export const ERR_NOM_PERSONA_PRIS = "personaNameTaken";

/**
 * Le nom d'un personnage est hors des bornes acceptées.
 *
 * Celui-ci a son propre message : contrairement aux autres refus de validation,
 * il survient au cours d'un usage normal et la personne peut y remédier.
 */
export const ERR_NOM_PERSONA = "personaNameLength";

/**
 * Journalise une erreur de base côté serveur, et rend le code à renvoyer.
 *
 * Les actions renvoyaient `error: error.message` — le message brut de
 * PostgreSQL. La couche d'affichage ne le montre plus, mais la chaîne
 * traversait encore la frontière serveur/client : elle partait dans la réponse,
 * lisible par qui inspecte le réseau, et cite le nom des tables et des règles.
 *
 * Le détail reste donc là où il sert — les journaux serveur — et seul un code
 * franchit la frontière.
 *
 * @param action nom de l'action, pour retrouver l'origine dans les journaux
 */
export function echecEnregistrement(
  action: string,
  erreur: { message?: string } | null | undefined,
): string {
  if (erreur?.message) console.error(`[action ${action}] ${erreur.message}`);
  return ERR_ENREGISTREMENT;
}

/**
 * Message à afficher pour un code d'erreur d'action.
 *
 * @param code ce que l'action a renvoyé — un code, ou n'importe quoi d'autre
 * @param t    `useTranslations("common")`
 */
export function messageErreurAction(
  code: string | undefined | null,
  t: (cle: string, valeurs?: Record<string, string | number | Date>) => string,
): string {
  if (code === ERR_NON_AUTHENTIFIE) return t("sessionExpired");
  if (code === ERR_INTROUVABLE) return t("notFoundOrForbidden");
  if (code === ERR_NOM_PERSONA) return t("personaNameLength");
  if (code === ERR_NOM_PERSONA_PRIS) return t("personaNameTaken");
  if (code === ERR_NOM_UTILISATEUR_PRIS) return t("usernameTaken");
  if (code === ERR_NON_AUTORISE) return t("forbidden");
  if (code === ERR_TAG_INVALIDE) return t("invalidTag");
  // Le seul message qui porte une valeur : la borne du plan gratuit, qui n'a
  // aucune raison d'être recopiée dans les trois fichiers de traduction.
  if (code === ERR_QUOTA_PERSONAS) {
    return t("personaQuotaReached", { count: FREE_PERSONAS_PER_WORLD });
  }
  return t("saveError");
}
