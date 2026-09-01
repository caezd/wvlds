"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AutoResizeTextarea } from "@/components/ui/auto-resizable-textarea";
import { cn } from "@/lib/utils";
import { submitBugReport } from "@/app/actions/bugReports";
import { messageErreurAction } from "@/lib/actionErrors";
import { BUG_REPORT_MAX_LENGTH, captureBugReportContext } from "@/lib/bugReports";

/**
 * Signalement d'un problème, ouvert depuis le menu utilisateur.
 *
 * La page courante et le navigateur sont joints automatiquement : ce sont les
 * deux informations qui rendent un rapport exploitable et qu'on ne pense jamais
 * à donner. Elles sont ANNONCÉES à l'écran plutôt que collectées en silence —
 * l'utilisateur doit savoir ce qu'il envoie.
 *
 * Le contexte est lu à l'ENVOI et non au montage : le composant est monté avec
 * la coque de l'application, donc une fois pour toutes, alors que la navigation
 * change d'adresse sans le remonter. Lu trop tôt, il rapporterait la première
 * page visitée de la session.
 */
export function BugReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("bugReport");
  const tCommon = useTranslations("common");
  const [description, setDescription] = React.useState("");
  const [envoi, setEnvoi] = React.useState(false);

  React.useEffect(() => {
    if (open) setDescription("");
  }, [open]);

  const tropLong = description.length > BUG_REPORT_MAX_LENGTH;
  const envoyable = description.trim().length > 0 && !tropLong && !envoi;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!envoyable) return;
    setEnvoi(true);
    const res = await submitBugReport({ description, ...captureBugReportContext() });
    setEnvoi(false);
    if (!res.ok) {
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    toast.success(t("sent"));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("intro")}</DialogDescription>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="bug-report-description">{t("descriptionLabel")}</Label>
            <AutoResizeTextarea
              id="bug-report-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              minRows={4}
              maxRows={14}
              aria-invalid={tropLong}
              className="resize-none rounded-md border bg-transparent p-3 text-sm outline-none"
            />
            <p className={cn("text-xs", tropLong ? "text-destructive" : "text-muted-foreground")}>
              {tropLong
                ? t("tooLong", { max: BUG_REPORT_MAX_LENGTH })
                : `${description.length} / ${BUG_REPORT_MAX_LENGTH}`}
            </p>
          </div>

          {/* Ce qui part avec le rapport, dit avant l'envoi. */}
          <p className="text-xs leading-snug text-muted-foreground">{t("attached")}</p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={!envoyable}>
              {envoi ? t("sending") : t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
