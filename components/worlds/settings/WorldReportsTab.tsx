"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, ExternalLink, Flag, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchOpenReports, resolveReport, type OpenReport } from "@/lib/messageReports";
import { replyExcerpt } from "@/lib/replyExcerpt";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import DateDisplay from "@/components/date-display";

/**
 * File des signalements ouverts d'un monde. Visible de qui a « Gérer les
 * salons » (la base fait foi : policy de lecture et resolve_message_report).
 */
export function WorldReportsTab({ worldId }: { worldId: string }) {
  const t = useTranslations("worlds");
  const supabase = useMemo(() => createClient(), []);
  const [reports, setReports] = useState<OpenReport[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<OpenReport | null>(null);

  const load = useCallback(async () => {
    setReports(await fetchOpenReports(supabase, worldId));
  }, [supabase, worldId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(report: OpenReport, action: "dismiss" | "delete") {
    setBusyId(report.id);
    const res = await resolveReport(supabase, report.id, action);
    setBusyId(null);
    if (!res.ok) {
      toast.error(t("reportsActionFailed"), { description: res.message });
      return;
    }
    // Supprimer règle aussi les autres signalements du même message.
    setReports((prev) =>
      (prev ?? []).filter((r) => r.id !== report.id && !(action === "delete" && r.message_id !== null && r.message_id === report.message_id)),
    );
    toast.success(action === "delete" ? t("reportsDeleted") : t("reportsDismissed"));
  }

  if (reports === null) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground" data-testid="reports-empty">
        <Flag className="h-5 w-5" />
        {t("reportsEmpty")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <p className="text-sm text-muted-foreground">{t("reportsIntro")}</p>
      <ul className="space-y-3">
        {reports.map((r) => {
          const auteur = r.persona_name ?? r.message_author?.username ?? t("reportsUnknown");
          const salon = r.chat?.title ?? r.chat?.name ?? t("reportsUnknown");
          const extrait = r.content === null ? null : (replyExcerpt(r.content) ?? t("reportsBlock"));
          const occupe = busyId === r.id;
          return (
            <li key={r.id} className="rounded-lg border border-border p-3" data-testid="report-item">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                <span>{t("reportsBy", { name: r.reporter?.username ?? t("reportsUnknown") })}</span>
                <span>·</span>
                <DateDisplay value={r.created_at} />
                <span>·</span>
                <span>{t("reportsInRoom", { room: salon })}</span>
              </div>
              <p className="mt-1 text-sm">« {r.reason} »</p>
              <div className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                {extrait === null ? (
                  <span className="italic text-muted-foreground">{t("reportsMessageGone")}</span>
                ) : (
                  <>
                    <span className="font-medium">{auteur} : </span>
                    <span className="text-muted-foreground">{extrait}</span>
                  </>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {r.message_id !== null && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/c/${r.chat_id}?m=${r.message_id}`}>
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      {t("reportsView")}
                    </Link>
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" disabled={occupe} onClick={() => void resolve(r, "dismiss")}>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  {t("reportsDismiss")}
                </Button>
                {r.message_id !== null && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={occupe}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setToDelete(r)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    {t("reportsDelete")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <DeleteConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => { if (!open) setToDelete(null); }}
        description={t("reportsDeleteConfirm")}
        onConfirm={async () => {
          if (toDelete) await resolve(toDelete, "delete");
          setToDelete(null);
        }}
      />
    </div>
  );
}
