"use client";

import { Eye, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import type { ChatroomVisibility } from "@/lib/chatroomAccess";
import type { ChatroomDay } from "@/lib/chatroomDay";
import { ChatroomDayStrip } from "@/components/chatrooms/day/ChatroomDayStrip";

/**
 * L'en-tête du fil : le temps du salon (migration 275), le synopsis, et la
 * visibilité quand le salon n'est pas ouvert. Affiché au début de
 * l'historique, donc seul dans un salon neuf.
 */
export function ChatroomSynopsis({
  synopsis,
  visibility,
  day = null,
  dateRange = null,
}: {
  synopsis: string | null;
  visibility: ChatroomVisibility;
  /** Météo et moment de la journée, au-dessus du synopsis. */
  day?: ChatroomDay | null;
  /** Début et avancée du salon sur la chronologie, quand des ellipses l'ont fait avancer. */
  dateRange?: string | null;
}) {
  const t = useTranslations("chatrooms.access");
  const text = synopsis?.trim() ?? "";
  if (!text && visibility === "open" && !day) return null;
  const Icon = visibility === "private" ? Lock : Eye;

  return (
    <section aria-label={t("synopsis")} className="py-6">
      <div className="space-y-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
        {day && (
          <div>
            {dateRange && <p className="text-xs text-muted-foreground">{dateRange}</p>}
            <ChatroomDayStrip day={day} />
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          {text ? <SectionLabel as="h2">{t("synopsis")}</SectionLabel> : <span />}
          {visibility !== "open" && (
            <Badge title={t(`${visibility}.description`)}>
              <Icon aria-hidden />
              {t(`${visibility}.title`)}
            </Badge>
          )}
        </div>
        {text ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
        ) : visibility !== "open" ? (
          <p className="text-sm text-muted-foreground">{t(`${visibility}.description`)}</p>
        ) : null}
      </div>
    </section>
  );
}

/** À la place du composeur, pour qui lit un salon public sans y être invité. */
export function ChatroomReadOnlyNotice() {
  const t = useTranslations("chatrooms.access");
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground"
    >
      <Eye className="size-4 shrink-0" aria-hidden />
      {t("readOnly")}
    </p>
  );
}
