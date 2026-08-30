/**
 * Traduction des erreurs d'authentification Supabase.
 *
 * ── Le problème ──────────────────────────────────────────────
 * Les formulaires de connexion, d'inscription et de mot de passe oublié
 * affichaient `error.message` tel quel. Ce message vient de Supabase et il est
 * TOUJOURS en anglais : « Invalid login credentials », « Email not confirmed ».
 * Une personne lisant l'application en français ou en espagnol le recevait
 * quand même en anglais, au moment précis où elle a besoin d'être comprise.
 *
 * ── Le principe ──────────────────────────────────────────────
 * Supabase pose un `code` stable sur ses erreurs d'authentification. On traduit
 * les cas où l'on peut dire quelque chose d'utile — mot de passe faux, adresse
 * non confirmée, trop de tentatives — et tout le reste retombe sur un message
 * générique traduit.
 *
 * On ne renvoie jamais `error.message` : au-delà de la langue, les erreurs
 * venant de la base (`throw error` sur une requête PostgREST) y placent le
 * texte brut de PostgreSQL, qui nomme les tables et les policies.
 *
 * @see https://supabase.com/docs/guides/auth/debugging/error-codes
 */

/** Codes d'erreur Supabase → clé du namespace `auth`. */
const CLE_PAR_CODE: Record<string, string> = {
  invalid_credentials: "errorInvalidCredentials",
  email_not_confirmed: "errorEmailNotConfirmed",
  user_already_exists: "errorUserAlreadyExists",
  email_exists: "errorUserAlreadyExists",
  weak_password: "errorWeakPassword",
  same_password: "errorSamePassword",
  over_request_rate_limit: "errorTooManyRequests",
  over_email_send_rate_limit: "errorTooManyRequests",
  email_address_invalid: "errorEmailInvalid",
  signup_disabled: "errorSignupDisabled",
  session_expired: "errorSessionExpired",
  // Nos propres codes (lib/actionErrors.ts), jetés par les formulaires de
  // cet arbre. Ils voyagent dans le message, faute d'un champ `code`.
  unauthenticated: "errorSessionExpired",
  usernameTaken: "errorUsernameTaken",
};

/**
 * Message à afficher pour une erreur d'authentification.
 *
 * @param erreur ce qu'a jeté le `try` — une erreur Supabase, ou autre chose
 * @param t      `useTranslations("auth")`
 */
export function messageErreurAuth(erreur: unknown, t: (cle: string) => string): string {
  const code = (erreur as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code in CLE_PAR_CODE) {
    return t(CLE_PAR_CODE[code]);
  }
  // Nos codes n'ont pas de champ `code` : ils sont le message lui-même.
  const message = erreur instanceof Error ? erreur.message : null;
  if (message !== null && message in CLE_PAR_CODE) return t(CLE_PAR_CODE[message]);

  // Le détail reste là où il sert : la console, pas l'écran.
  if (erreur) console.error("[auth]", erreur);
  return t("errorGeneric");
}

/** Exposé pour que le test puisse vérifier que chaque clé existe vraiment. */
export const CLES_ERREUR_AUTH = Object.values(CLE_PAR_CODE).concat("errorGeneric");
