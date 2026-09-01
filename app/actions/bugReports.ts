"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import {
  BUG_REPORT_MAX_ATTACHMENTS,
  BUG_REPORT_URL_MAX_LENGTH,
  BUG_REPORT_USER_AGENT_MAX_LENGTH,
  isBugReportStatus,
  isOwnAttachmentPath,
  isValidBugReportDescription,
  type BugReportStatus,
} from "@/lib/bugReports";
import { normaliserJournalClient } from "@/lib/clientErrorLog";
import {
  ERR_NON_AUTHENTIFIE,
  ERR_VALEUR_NON_SUPPORTEE,
  echecEnregistrement,
} from "@/lib/actionErrors";

/**
 * Dépose un signalement.
 *
 * `status` et `admin_note` ne sont volontairement pas acceptés : la policy
 * d'insertion les contraint déjà à leur valeur d'ouverture (migration 137), et
 * ne pas les exposer ici évite d'avoir à s'en souvenir.
 */
export async function submitBugReport(rapport: {
  description: string;
  pageUrl?: string;
  userAgent?: string;
  /** Chemins déjà déposés dans le bucket, sous le préfixe de leur auteur. */
  attachments?: string[];
  /** Dernières erreurs du navigateur, si l'auteur les joint. */
  clientErrors?: unknown;
}) {
  if (!isValidBugReportDescription(rapport.description)) {
    return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId) return { ok: false as const, error: ERR_NON_AUTHENTIFIE };

  // Les chemins viennent du client. Sans cette vérification, un rapport
  // pourrait désigner le dépôt de quelqu'un d'autre — et le faire signer, la
  // signature étant demandée au nom de l'administrateur qui le consulte, dont
  // la policy de lecture couvre tout le bucket.
  const attachments = rapport.attachments ?? [];
  const recevables =
    attachments.length <= BUG_REPORT_MAX_ATTACHMENTS &&
    attachments.every((chemin) => isOwnAttachmentPath(chemin, userId));
  if (!recevables) return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };

  const { error } = await supabase.from("bug_reports").insert({
    user_id: userId,
    description: rapport.description.trim(),
    // Bornés une seconde fois ici : ces valeurs viennent du poste client, et la
    // contrainte en base rejetterait toute la ligne plutôt que de couper.
    page_url: rapport.pageUrl?.slice(0, BUG_REPORT_URL_MAX_LENGTH) || null,
    user_agent: rapport.userAgent?.slice(0, BUG_REPORT_USER_AGENT_MAX_LENGTH) || null,
    app_version: process.env.NEXT_PUBLIC_APP_VERSION || null,
    attachments,
    // Renormalisé ici : le journal traverse le réseau, et une entrée malformée
    // ferait rejeter toute la ligne par la contrainte de la migration 139. Il
    // est borné plutôt que refusé — perdre un rapport à cause de sa pile
    // reviendrait à perdre la seule chose que son auteur ait écrite.
    client_errors: normaliserJournalClient(rapport.clientErrors),
  });
  if (error) return { ok: false as const, error: echecEnregistrement("submitBugReport", error) };

  revalidatePath("/admin/bug-reports");
  return { ok: true as const };
}

/**
 * Change le statut d'un signalement.
 *
 * La vérification d'administrateur est faite ICI en plus de la policy RLS. La
 * policy suffirait à empêcher l'écriture, mais elle échouerait par un message
 * de PostgreSQL que l'appelant afficherait tel quel — alors que le refus mérite
 * un code stable et traduit (voir lib/actionErrors.ts).
 */
export async function setBugReportStatus(reportId: string, status: BugReportStatus) {
  if (!isBugReportStatus(status)) {
    return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
  }
  if (!(await isAdmin())) return { ok: false as const, error: ERR_NON_AUTHENTIFIE };

  const supabase = await createClient();
  const { error } = await supabase.from("bug_reports").update({ status }).eq("id", reportId);
  if (error) return { ok: false as const, error: echecEnregistrement("setBugReportStatus", error) };

  revalidatePath("/admin/bug-reports");
  return { ok: true as const };
}

/** Supprime un signalement — réservé aux administrateurs, comme le statut. */
export async function deleteBugReport(reportId: string) {
  if (!(await isAdmin())) return { ok: false as const, error: ERR_NON_AUTHENTIFIE };

  const supabase = await createClient();
  const { error } = await supabase.from("bug_reports").delete().eq("id", reportId);
  if (error) return { ok: false as const, error: echecEnregistrement("deleteBugReport", error) };

  revalidatePath("/admin/bug-reports");
  return { ok: true as const };
}
