"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { REPORT_REASON_MAX, reportMessage } from "@/lib/messageReports";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Signaler un message aux modérateurs du monde (qui ont « Gérer les salons »).
 * Une seule instance par salon, pilotée par l'id du message à signaler :
 * null = fermée.
 */
export function ReportMessageDialog({
  messageId,
  onClose,
}: {
  messageId: number | null;
  onClose: () => void;
}) {
  const t = useTranslations("chatrooms");
  const supabase = useMemo(() => createClient(), []);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  // Chaque ouverture repart d'une raison vide.
  useEffect(() => {
    if (messageId !== null) setReason("");
  }, [messageId]);

  async function submit() {
    if (messageId === null || !reason.trim()) return;
    setSending(true);
    const res = await reportMessage(supabase, messageId, reason);
    setSending(false);
    if (res.ok) {
      toast.success(t("reportSent"));
      onClose();
    } else if (res.reason === "duplicate") {
      toast.info(t("reportDuplicate"));
      onClose();
    } else {
      toast.error(t("reportFailed"), { description: res.message });
    }
  }

  return (
    <Dialog open={messageId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("reportTitle")}</DialogTitle>
          <DialogDescription>{t("reportDescription")}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, REPORT_REASON_MAX))}
          placeholder={t("reportPlaceholder")}
          aria-label={t("reportPlaceholder")}
          rows={4}
          autoFocus
        />
        <p className="text-right text-xs text-muted-foreground">{reason.length}/{REPORT_REASON_MAX}</p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={sending}>
            {t("reportCancel")}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={sending || !reason.trim()}>
            {sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t("reportSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
