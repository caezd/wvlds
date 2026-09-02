/**
 * Journal des dernières erreurs survenues dans le navigateur.
 *
 * Un signalement dit « ça a planté » ; ce journal dit quoi. Sans lui, ce qui a
 * échoué n'existe plus nulle part au moment où l'utilisateur ouvre le
 * formulaire : les deux frontières d'erreur affichent l'incident puis
 * l'oublient, et le `digest` qu'elles montrent ne couvre que le rendu serveur.
 *
 * Conservé dans `sessionStorage` et non en mémoire : une erreur fatale remplace
 * tout l'arbre React (`app/global-error.tsx`) et se solde le plus souvent par un
 * rechargement — exactement le moment où un état de module disparaîtrait. Le
 * repli en mémoire ne sert qu'aux navigations privées et aux contextes où le
 * stockage lève.
 */

export const CLIENT_ERROR_LOG_KEY = "wvlds:erreurs-client";

/** Ce qu'on garde, et jusqu'où. Un journal illimité finirait par peser plus
 *  lourd que le signalement qu'il accompagne. */
export const CLIENT_ERROR_LOG_MAX = 10;
export const CLIENT_ERROR_MESSAGE_MAX = 500;
export const CLIENT_ERROR_STACK_MAX = 1500;

/** D'où vient l'erreur — c'est souvent ce qui la rend interprétable. */
export const CLIENT_ERROR_KINDS = ["uncaught", "rejection", "console"] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export type ErreurClient = {
  /** Horodatage ISO : l'écart avec l'envoi du rapport dit si l'erreur est celle
   *  qu'on signale ou une trace plus ancienne de la même session. */
  at: string;
  kind: ClientErrorKind;
  message: string;
  /** Fichier et ligne, quand le navigateur les donne. */
  source?: string;
  stack?: string;
};

/**
 * Ramène une entrée quelconque à une entrée recevable, ou à rien.
 *
 * Partagée par l'enregistrement côté navigateur et par l'action serveur : le
 * journal traverse le réseau, donc il est renormalisé à l'arrivée plutôt que
 * cru sur parole.
 */
export function normaliserErreurClient(valeur: unknown): ErreurClient | null {
  if (!valeur || typeof valeur !== "object") return null;
  const brut = valeur as Record<string, unknown>;

  const message = typeof brut.message === "string" ? brut.message.trim() : "";
  if (message.length === 0) return null;

  const kind = CLIENT_ERROR_KINDS.includes(brut.kind as ClientErrorKind)
    ? (brut.kind as ClientErrorKind)
    : "console";

  const at = typeof brut.at === "string" && !Number.isNaN(Date.parse(brut.at))
    ? brut.at
    : new Date().toISOString();

  const entrée: ErreurClient = { at, kind, message: message.slice(0, CLIENT_ERROR_MESSAGE_MAX) };
  if (typeof brut.source === "string" && brut.source.length > 0) {
    entrée.source = brut.source.slice(0, CLIENT_ERROR_MESSAGE_MAX);
  }
  if (typeof brut.stack === "string" && brut.stack.length > 0) {
    entrée.stack = brut.stack.slice(0, CLIENT_ERROR_STACK_MAX);
  }
  return entrée;
}

/**
 * Borne un journal reçu : entrées recevables seulement, et les plus récentes.
 *
 * Tronque plutôt que refuse — le journal accompagne le signalement, il ne le
 * constitue pas. Perdre un rapport parce que sa pile est malformée serait
 * perdre la seule chose qu'un utilisateur ait pris la peine d'écrire.
 */
export function normaliserJournalClient(valeur: unknown): ErreurClient[] {
  if (!Array.isArray(valeur)) return [];
  return valeur
    .map(normaliserErreurClient)
    .filter((e): e is ErreurClient => e !== null)
    .slice(-CLIENT_ERROR_LOG_MAX);
}

/** Repli quand `sessionStorage` est hors d'atteinte (navigation privée, ou un
 *  contexte qui lève à la simple lecture). Le journal vit alors le temps de la
 *  page, ce qui vaut mieux que rien. */
let enMémoire: ErreurClient[] = [];

function lireStockage(): ErreurClient[] | null {
  try {
    const brut = window.sessionStorage.getItem(CLIENT_ERROR_LOG_KEY);
    if (!brut) return [];
    return normaliserJournalClient(JSON.parse(brut));
  } catch {
    return null;
  }
}

function écrireStockage(journal: ErreurClient[]): boolean {
  try {
    window.sessionStorage.setItem(CLIENT_ERROR_LOG_KEY, JSON.stringify(journal));
    return true;
  } catch {
    return false;
  }
}

/** Le journal de la session, du plus ancien au plus récent. */
export function lireErreursClient(): ErreurClient[] {
  if (typeof window === "undefined") return [];
  return lireStockage() ?? enMémoire;
}

/**
 * Ajoute une erreur au journal.
 *
 * Un message déjà présent est déplacé en fin de journal plutôt que répété : une
 * erreur de rendu se reproduit à chaque tentative, et dix lignes identiques
 * chasseraient du journal les erreurs qui l'ont précédée — celles, justement,
 * qui expliquent souvent la dernière.
 */
export function enregistrerErreurClient(entrée: unknown): void {
  if (typeof window === "undefined") return;
  const normalisée = normaliserErreurClient(entrée);
  if (!normalisée) return;

  const journal = lireErreursClient().filter((e) => e.message !== normalisée.message);
  journal.push(normalisée);
  const borné = journal.slice(-CLIENT_ERROR_LOG_MAX);

  if (!écrireStockage(borné)) enMémoire = borné;
}

/** Vide le journal — après un envoi, pour ne pas rattacher au signalement
 *  suivant des erreurs déjà rapportées. */
export function oublierErreursClient(): void {
  enMémoire = [];
  try {
    window.sessionStorage.removeItem(CLIENT_ERROR_LOG_KEY);
  } catch {
    // Rien à faire : le repli en mémoire vient d'être vidé.
  }
}
