import { getTranslations } from "next-intl/server";

import { requireAdmin } from "@/lib/admin";
import { signBugReportAttachments } from "@/lib/bugReportAttachments";
import type { BugReport } from "@/lib/bugReports";
import { BugReportRow } from "./BugReportRow";
import { CleanAttachmentsButton } from "./CleanAttachmentsButton";

/**
 * File de tri des signalements.
 *
 * `requireAdmin()` garde la route ; la policy RLS de `bug_reports` garde la
 * donnée. Les deux sont nécessaires : la première évite d'afficher une page
 * vide à qui n'a rien à y faire, la seconde évite qu'une requête forgée en
 * dehors de cette page ne rapporte les signalements de tout le monde.
 *
 * Les plus récents d'abord, tous statuts confondus : un traitement en deux
 * temps (« nouveau » puis le reste) supposerait un volume qu'on n'a pas encore,
 * et l'index (status, created_at DESC) posé par la migration 137 sert déjà un
 * filtrage par statut le jour où il deviendra utile.
 */
export default async function BugReportsPage() {
  const { supabase } = await requireAdmin();
  const t = await getTranslations("admin.bugReports");

  const { data } = await supabase
    .from("bug_reports")
    .select(
      "id, user_id, description, page_url, user_agent, app_version, status, admin_note, created_at, attachments, client_errors",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const reports = (data ?? []) as BugReport[];

  // Signées en une fois pour toute la page : une requête par image serait un
  // aller-retour par vignette.
  const signées = await signBugReportAttachments(
    supabase,
    reports.flatMap((r) => r.attachments ?? []),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <CleanAttachmentsButton />
      </div>

      {reports.length === 0 ? (
        <div className="rounded-lg border border-border-soft p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => (
            <BugReportRow
              key={report.id}
              report={report}
              attachmentUrls={(report.attachments ?? [])
                .map((chemin) => signées.get(chemin))
                .filter((url): url is string => !!url)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
