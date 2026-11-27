"use client";

import { Eye, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import type { ChatroomVisibility } from "@/lib/chatroomAccess";
import type { DayPoint } from "@/lib/chatroomDay";
import { ChatroomDayStrip } from "@/components/chatrooms/day/ChatroomDayStrip";

/**
 * L'en-tête du fil : le temps du départ du salon (migration 275), le synopsis, et la
 * visibilité quand le salon n'est pas ouvert. Affiché au début de
 * l'historique, donc seul dans un salon neuf.
 */
export function ChatroomSynopsis({
  synopsis,
  visibility,
  day = null,
}: {
  synopsis: string | null;
  visibility: ChatroomVisibility;
  /** Météo et moment de la journée au départ du salon, au-dessus du synopsis ; les ellipses n'y touchent pas. */
  day?: DayPoint | null;
}) {
  const t = useTranslations("chatrooms.access");
  const text = synopsis?.trim() ?? "";
  if (!text && visibility === "open" && !day) return null;
  const Icon = visibility === "private" ? Lock : Eye;

  // L'encadré ne porte que le synopsis et la visibilité ; le temps se tient
  // au-dessus, hors de l'encadré.
  const boxed = !!text || visibility !== "open";

  return (
    <section aria-label={t("synopsis")} className="space-y-3 py-6">
      {day && <ChatroomDayStrip day={day} />}
      {boxed && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
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
      )}
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
