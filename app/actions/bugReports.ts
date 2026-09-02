"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import {
  BUG_REPORT_BUCKET,
  BUG_REPORT_MAX_ATTACHMENTS,
  BUG_REPORT_MAX_PER_HOUR,
  BUG_REPORT_NOTE_MAX_LENGTH,
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
  ERR_RYTHME_SIGNALEMENTS,
  ERR_VALEUR_NON_SUPPORTEE,
  echecEnregistrement,
} from "@/lib/actionErrors";

/**
 * Dépose un signalement.
 *
 * `status` et `admin_note` ne sont volontairement pas acceptés : la policy
 * d'insertion les contraint déjà à leur valeur d'ouverture (migration 144), et
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

  // Le plafond horaire est d'abord tenu par la policy d'insertion (migration
  // 140). On le vérifie ici pour que le refus arrive traduit : la RLS, elle,
  // échoue par un message de PostgreSQL que le formulaire afficherait tel quel.
  //
  // Un comptage indisponible laisse donc passer, à dessein : ce contrôle sert
  // la formulation du refus, pas le refus lui-même — que la policy prononce de
  // toute façon. Refuser ici sur une panne de lecture perdrait un signalement
  // légitime pour rien.
  const { data: recents } = await supabase.rpc("bug_reports_recent_count", { uid: userId });
  if (typeof recents === "number" && recents >= BUG_REPORT_MAX_PER_HOUR) {
    return { ok: false as const, error: ERR_RYTHME_SIGNALEMENTS };
  }

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
    // ferait rejeter toute la ligne par la contrainte de la migration 146. Il
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

/**
 * Écrit la note de traitement d'un signalement.
 *
 * La colonne existait depuis la migration 144 sans que rien ne l'écrive : elle
 * voyageait jusqu'au client et ne s'affichait nulle part. C'est la trace de ce
 * qui a été fait d'un rapport — pourquoi il a été écarté, ce qui le corrige —
 * et elle ne quitte jamais l'administration : la policy d'UPDATE la réserve aux
 * administrateurs, et son auteur ne la lit pas.
 */
export async function setBugReportNote(reportId: string, note: string) {
  if (!(await isAdmin())) return { ok: false as const, error: ERR_NON_AUTHENTIFIE };
  if (note.length > BUG_REPORT_NOTE_MAX_LENGTH) {
    return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
  }

  const supabase = await createClient();
  // Vidée plutôt que remplie d'une chaîne creuse : la colonne accepte NULL, et
  // « pas de note » se lit mieux qu'une note vide.
  const valeur = note.trim();
  const { error } = await supabase
    .from("bug_reports")
    .update({ admin_note: valeur.length > 0 ? valeur : null })
    .eq("id", reportId);
  if (error) return { ok: false as const, error: echecEnregistrement("setBugReportNote", error) };

  revalidatePath("/admin/bug-reports");
  return { ok: true as const };
}

/**
 * Supprime les images déposées qui n'ont jamais accompagné de rapport.
 *
 * Une image part vers le stockage AVANT le rapport : qui change d'avis, ou dont
 * l'envoi échoue, laisse un fichier que plus rien ne désigne. Le nettoyage fait
 * à la suppression d'un rapport ne les couvre pas — ils n'ont jamais appartenu
 * à aucun.
 *
 * L'identification est faite en base (migration 147) : un objet du bucket dont
 * le chemin n'apparaît dans les `attachments` d'aucun rapport, et déposé il y a
 * plus d'un jour. Ce délai de grâce est ce qui la rend sûre — sans lui, on
 * supprimerait les images d'un formulaire encore en train d'être rempli.
 *
 * La suppression, elle, passe par l'API de stockage : effacer la ligne de
 * `storage.objects` laisserait l'octet dans le stockage d'objets.
 */
export async function cleanBugReportAttachments() {
  if (!(await isAdmin())) return { ok: false as const, error: ERR_NON_AUTHENTIFIE };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("orphan_bug_report_attachments");
  if (error) return { ok: false as const, error: echecEnregistrement("cleanBugReportAttachments", error) };

  const chemins = (data ?? []) as string[];
  if (chemins.length === 0) return { ok: true as const, removed: 0 };

  const { error: erreurStockage } = await supabase.storage
    .from(BUG_REPORT_BUCKET)
    .remove(chemins);
  if (erreurStockage) {
    return { ok: false as const, error: echecEnregistrement("cleanBugReportAttachments", erreurStockage) };
  }

  revalidatePath("/admin/bug-reports");
  return { ok: true as const, removed: chemins.length };
}

/**
 * Supprime un signalement — réservé aux administrateurs, comme le statut.
 *
 * Les captures partent avec lui. Supprimer la seule ligne les laisserait dans
 * le bucket sans que rien ne les désigne plus : injoignables par l'application,
 * mais conservées — et ce sont des captures d'écran, donc souvent des données
 * personnelles que la suppression du rapport était censée effacer.
 *
 * Les fichiers d'abord, la ligne ensuite : l'ordre inverse perdrait les chemins
 * en cas d'échec, et personne ne saurait plus quoi nettoyer.
 */
export async function deleteBugReport(reportId: string) {
  if (!(await isAdmin())) return { ok: false as const, error: ERR_NON_AUTHENTIFIE };

  const supabase = await createClient();

  const { data: rapport } = await supabase
    .from("bug_reports")
    .select("attachments")
    .eq("id", reportId)
    .maybeSingle();

  const chemins = (rapport?.attachments ?? []) as string[];
  if (chemins.length > 0) {
    const { error } = await supabase.storage.from(BUG_REPORT_BUCKET).remove(chemins);
    // Un fichier déjà absent ne doit pas retenir la suppression du rapport :
    // c'est l'état recherché. On s'arrête en revanche sur un refus, sans quoi
    // la ligne disparaîtrait en laissant ses images derrière elle.
    if (error) return { ok: false as const, error: echecEnregistrement("deleteBugReport", error) };
  }

  const { error } = await supabase.from("bug_reports").delete().eq("id", reportId);
  if (error) return { ok: false as const, error: echecEnregistrement("deleteBugReport", error) };

  revalidatePath("/admin/bug-reports");
  return { ok: true as const };
}
