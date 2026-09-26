"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Spline, X } from "lucide-react";

import type { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SequelRequest = {
  id: string;
  chatroomTitle: string;
  previousTitle: string;
  createdByName: string | null;
};

/**
 * Les suites proposées que l'on peut accepter (migration 194) : celles qui
 * s'accrochent à un salon où l'on joue, ou toutes pour qui gère les salons
 * ou la chronologie. Les accepter relie les salons ; les refuser supprime le
 * lien proposé. Le bouton ne paraît que s'il y a quelque chose à décider.
 */
export function TimelineSequelRequests({
  requests,
  supabase,
  onChanged,
}: {
  requests: SequelRequest[];
  supabase: ReturnType<typeof createClient>;
  onChanged: () => void;
}) {
  const t = useTranslations("worlds.timelineView");
  const [busy, setBusy] = React.useState<string | null>(null);

  async function accept(id: string) {
    setBusy(id);
    const { error } = await supabase.from(TABLE.CHATROOM_SEQUELS).update({ status: "accepted" }).eq("id", id);
    setBusy(null);
    if (error) {
      console.error("[TimelineSequelRequests] acceptation", error);
      toast.error(t("sequelAnswerFailed"));
      return;
    }
    onChanged();
  }

  async function decline(id: string) {
    setBusy(id);
    const { error } = await supabase.from(TABLE.CHATROOM_SEQUELS).delete().eq("id", id);
    setBusy(null);
    if (error) {
      console.error("[TimelineSequelRequests] refus", error);
      toast.error(t("sequelAnswerFailed"));
      return;
    }
    onChanged();
  }

  if (requests.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1.5">
          <Spline className="h-3.5 w-3.5" />
          {t("sequelRequests")}
          <span className="rounded-full bg-foreground px-1.5 text-[10px] font-semibold leading-4 text-background" data-testid="timeline-sequel-count">
            {requests.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2">
        <p className="text-xs text-muted-foreground">{t("sequelRequestsHelp")}</p>
        <ul className="space-y-2" aria-label={t("sequelRequests")}>
          {requests.map((r) => (
            <li key={r.id} className="flex items-start gap-2 rounded-lg border border-border p-2">
              <p className="min-w-0 flex-1 text-sm leading-snug">
                {t.rich("sequelRequestLine", {
                  chatroom: r.chatroomTitle,
                  previous: r.previousTitle,
                  b: (chunks) => <span className="font-medium">{chunks}</span>,
                })}
                {r.createdByName && (
                  <span className="block text-xs text-muted-foreground">{t("sequelRequestBy", { name: r.createdByName })}</span>
                )}
              </p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={busy === r.id}
                aria-label={t("sequelAccept", { chatroom: r.chatroomTitle })}
                onClick={() => void accept(r.id)}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={busy === r.id}
                aria-label={t("sequelDecline", { chatroom: r.chatroomTitle })}
                onClick={() => void decline(r.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
