/**
 * Rapports de bug — constantes et validation, partagées par le formulaire, par
 * l'action serveur et par la page de tri.
 *
 * Elles vivent ici et non dans `app/actions/bugReports.ts` : un module
 * `"use server"` ne peut exporter que des fonctions asynchrones. C'est la même
 * séparation que `worldHomeGrid.ts` pour les actions de monde.
 */

/** Longueur maximale d'un signalement — miroir de la contrainte en base
 *  (`bug_reports_description_length`, migration 137). */
export const BUG_REPORT_MAX_LENGTH = 4000;

/** Longueurs des informations capturées automatiquement, bornées comme en base
 *  plutôt que laissées à la merci d'un navigateur bavard. */
export const BUG_REPORT_URL_MAX_LENGTH = 2000;
export const BUG_REPORT_USER_AGENT_MAX_LENGTH = 500;

/** Trois pièces jointes au plus — miroir de la contrainte
 *  `bug_reports_attachments_bounds` (migration 138). */
export const BUG_REPORT_MAX_ATTACHMENTS = 3;

/** Bucket PRIVÉ : une capture montre souvent autre chose que le bug. Les
 *  images ne sortent que par une URL signée (voir lib/bugReportAttachments). */
export const BUG_REPORT_BUCKET = "bug-reports";

/** Types acceptés — ce qu'un navigateur produit d'une capture d'écran. */
export const BUG_REPORT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export const BUG_REPORT_STATUSES = ["new", "in_progress", "resolved", "declined"] as const;
export type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

export function isBugReportStatus(value: unknown): value is BugReportStatus {
  return typeof value === "string" && (BUG_REPORT_STATUSES as readonly string[]).includes(value);
}

export type BugReport = {
  /** Chemins de stockage, jamais des URL : une URL signée expire. */
  attachments: string[];
  id: string;
  user_id: string;
  description: string;
  page_url: string | null;
  user_agent: string | null;
  app_version: string | null;
  status: BugReportStatus;
  admin_note: string | null;
  created_at: string;
};

/**
 * Les chemins recevables pour une pièce jointe.
 *
 * Le chemin arrive du client : il est vérifié contre le préfixe de son auteur
 * avant d'être enregistré, faute de quoi un rapport pourrait référencer le
 * dépôt de quelqu'un d'autre — et le faire signer, puisque la signature est
 * demandée au nom de l'administrateur qui consulte.
 */
export function isOwnAttachmentPath(path: string, userId: string): boolean {
  return path.startsWith(`user-${userId}/`) && path.length <= 300 && !path.includes("..");
}

/**
 * Un signalement vide n'en est pas un, et un signalement démesuré est refusé
 * plutôt que tronqué : tronquer couperait le texte au milieu d'une phrase sans
 * que son auteur le sache, alors que le compteur du formulaire l'avertit avant
 * l'envoi.
 */
export function isValidBugReportDescription(description: string): boolean {
  const texte = description.trim();
  return texte.length > 0 && texte.length <= BUG_REPORT_MAX_LENGTH;
}

/**
 * Contexte capturé à l'envoi — jamais saisi.
 *
 * Ce sont les deux informations qui rendent un rapport exploitable et qu'un
 * utilisateur ne pense jamais à donner : sur quelle page il était, et avec quel
 * navigateur. Bornées ici pour ne pas dépendre de ce que renvoie le poste
 * client.
 */
export function captureBugReportContext(): { pageUrl: string; userAgent: string } {
  if (typeof window === "undefined") return { pageUrl: "", userAgent: "" };
  return {
    pageUrl: window.location.href.slice(0, BUG_REPORT_URL_MAX_LENGTH),
    userAgent: window.navigator.userAgent.slice(0, BUG_REPORT_USER_AGENT_MAX_LENGTH),
  };
}
