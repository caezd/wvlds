import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireAdmin } from "@/lib/admin";
import { signBugReportAttachments } from "@/lib/bugReportAttachments";
import { cn } from "@/lib/utils";
import {
  BUG_REPORT_STATUSES,
  isBugReportStatus,
  type BugReport,
  type BugReportStatus,
} from "@/lib/bugReports";
import { BugReportRow } from "./BugReportRow";
import { CleanAttachmentsButton } from "./CleanAttachmentsButton";

/**
 * Combien de signalements par page.
 *
 * La page en chargeait 200 d'un bloc, et signait TOUTES leurs pièces jointes à
 * chaque affichage — jusqu'à six cents URL valables dix minutes, dont on n'en
 * regarde qu'une poignée. Vingt-cinq tiennent dans un écran de tri.
 */
const PAR_PAGE = 25;

/**
 * File de tri des signalements.
 *
 * `requireAdmin()` garde la route ; la policy RLS de `bug_reports` garde la
 * donnée. Les deux sont nécessaires : la première évite d'afficher une page
 * vide à qui n'a rien à y faire, la seconde évite qu'une requête forgée en
 * dehors de cette page ne rapporte les signalements de tout le monde.
 *
 * Le filtre par statut sert enfin l'index `(status, created_at DESC)` posé par
 * la migration 137, qu'aucune requête n'utilisait jusqu'ici.
 */
export default async function BugReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const t = await getTranslations("admin.bugReports");
  const params = await searchParams;

  // Un statut inconnu vaut « tous » plutôt qu'une liste vide : la valeur vient
  // de l'URL, où n'importe quoi peut être écrit à la main.
  const statut = isBugReportStatus(params.status) ? (params.status as BugReportStatus) : null;
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);
  const début = page * PAR_PAGE;

  let requête = supabase
    .from("bug_reports")
    .select(
      "id, user_id, description, page_url, user_agent, app_version, status, admin_note, created_at, attachments, client_errors",
    );
  if (statut) requête = requête.eq("status", statut);

  // Une ligne de plus que la page : suffit à savoir s'il y a une suite, sans
  // payer un comptage exact dont on n'afficherait pas le total.
  const { data } = await requête
    .order("created_at", { ascending: false })
    .range(début, début + PAR_PAGE);

  const lignes = (data ?? []) as BugReport[];
  const suite = lignes.length > PAR_PAGE;
  const reports = suite ? lignes.slice(0, PAR_PAGE) : lignes;

  // Signées en une fois pour toute la page : une requête par image serait un
  // aller-retour par vignette.
  const signées = await signBugReportAttachments(
    supabase,
    reports.flatMap((r) => r.attachments ?? []),
  );

  const lien = (p: { statut?: BugReportStatus | null; page?: number }) => {
    const q = new URLSearchParams();
    const s = p.statut === undefined ? statut : p.statut;
    if (s) q.set("status", s);
    if (p.page) q.set("page", String(p.page));
    const suffixe = q.toString();
    return suffixe ? `/admin/bug-reports?${suffixe}` : "/admin/bug-reports";
  };

  const onglet = "rounded-lg border px-3 py-1 text-xs transition-colors";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <CleanAttachmentsButton />
      </div>

      <nav className="flex flex-wrap gap-2">
        <Link
          href={lien({ statut: null })}
          aria-current={statut === null ? "page" : undefined}
          className={cn(onglet, statut === null ? "border-accent bg-accent/10 text-accent" : "hover:bg-muted")}
        >
          {t("filterAll")}
        </Link>
        {BUG_REPORT_STATUSES.map((s) => (
          <Link
            key={s}
            href={lien({ statut: s })}
            aria-current={statut === s ? "page" : undefined}
            className={cn(onglet, statut === s ? "border-accent bg-accent/10 text-accent" : "hover:bg-muted")}
          >
            {t(`status.${s}`)}
          </Link>
        ))}
      </nav>

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

      {(page > 0 || suite) && (
        <div className="flex items-center justify-center gap-3 pt-2">
          {page > 0 && (
            <Link
              href={lien({ page: page - 1 })}
              className="rounded-xl border border-border px-4 py-1.5 text-sm transition-colors hover:bg-muted/50"
            >
              {t("previous")}
            </Link>
          )}
          <span className="text-sm tabular-nums text-muted-foreground">{page + 1}</span>
          {suite && (
            <Link
              href={lien({ page: page + 1 })}
              className="rounded-xl border border-border px-4 py-1.5 text-sm transition-colors hover:bg-muted/50"
            >
              {t("next")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
