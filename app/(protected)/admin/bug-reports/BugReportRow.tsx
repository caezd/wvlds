"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteBugReport, setBugReportStatus } from "@/app/actions/bugReports";
import { messageErreurAction } from "@/lib/actionErrors";
import { BUG_REPORT_STATUSES, type BugReport, type BugReportStatus } from "@/lib/bugReports";

/**
 * Une ligne de la file de tri.
 *
 * Client alors que la page est serveur : le statut se change sans quitter la
 * liste. L'état est local et optimiste — `revalidatePath` côté action rafraîchit
 * la page, mais l'attendre laisserait le sélecteur figé sur l'ancienne valeur le
 * temps de l'aller-retour.
 */
export function BugReportRow({ report }: { report: BugReport }) {
  const t = useTranslations("admin.bugReports");
  const tCommon = useTranslations("common");
  const [status, setStatus] = React.useState<BugReportStatus>(report.status);
  const [supprimé, setSupprimé] = React.useState(false);

  if (supprimé) return null;

  async function changerStatut(valeur: string) {
    const précédent = status;
    setStatus(valeur as BugReportStatus);
    const res = await setBugReportStatus(report.id, valeur as BugReportStatus);
    if (!res.ok) {
      // Remettre la valeur d'avant : laisser le sélecteur sur un statut que la
      // base n'a pas accepté ferait croire au tri d'être fait.
      setStatus(précédent);
      toast.error(messageErreurAction(res.error, tCommon));
    }
  }

  async function supprimer() {
    const res = await deleteBugReport(report.id);
    if (!res.ok) {
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    setSupprimé(true);
  }

  return (
    <li className="rounded-xl border border-border-soft p-4">
      <div className="flex items-start justify-between gap-4">
        {/* `whitespace-pre-line` : un signalement est souvent écrit en
            plusieurs paragraphes, et les écraser rendrait le récit illisible. */}
        <p className="min-w-0 flex-1 whitespace-pre-line text-sm">{report.description}</p>

        <div className="flex shrink-0 items-center gap-2">
          <Select value={status} onValueChange={(v) => void changerStatut(v)}>
            <SelectTrigger className="h-8 w-36" aria-label={t("statusLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUG_REPORT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DeleteConfirmDialog
            title={t("deleteTitle")}
            description={t("deleteDescription")}
            onConfirm={() => void supprimer()}
            trigger={
              <button
                type="button"
                aria-label={tCommon("delete")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            }
          />
        </div>
      </div>

      <dl className="mt-3 space-y-0.5 text-xs text-muted-foreground">
        {report.page_url && (
          <div>
            <dt className="inline font-medium">{t("page")} : </dt>
            <dd className="inline break-all">{report.page_url}</dd>
          </div>
        )}
        {report.user_agent && (
          <div>
            <dt className="inline font-medium">{t("browser")} : </dt>
            <dd className="inline break-all">{report.user_agent}</dd>
          </div>
        )}
        {report.app_version && (
          <div>
            <dt className="inline font-medium">{t("version")} : </dt>
            <dd className="inline">{report.app_version}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}
