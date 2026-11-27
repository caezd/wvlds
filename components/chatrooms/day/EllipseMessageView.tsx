"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { GameBlockToolbar } from "@/components/chatrooms/blocks/GameBlockShell";
import type { ChatroomEllipse } from "@/lib/chatroomDay";
import { formatTimelineLabel } from "@/lib/worldTimeline";
import { ChatroomDayStrip } from "./ChatroomDayStrip";
import { useChatroomTime } from "./chatroomTime";

/**
 * Un message « Ellipse » (migration 275) : une ligne seule dans le fil, sans
 * auteur, la date atteinte au-dessus quand le salon est daté. Le saut se lit
 * dans la ligne `chatroom_ellipses` jointe au message, jamais dans son
 * texte ; les jours passés et la date décrivent la ligne pour les lecteurs
 * d'écran.
 */
export function EllipseMessageView({
  ellipse,
  mine,
  onDelete,
}: {
  ellipse: ChatroomEllipse | null | undefined;
  mine: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations("chatrooms.dayStatus");
  const { config } = useChatroomTime();
  const descriptionId = useId();
  const date = ellipse?.to_date && config && ellipse.days > 0 ? formatTimelineLabel(config, ellipse.to_date) : null;
  const description = ellipse ? [t("later", { count: ellipse.days }), date].filter(Boolean).join(" · ") : null;

  return (
    <article
      aria-label={t("ellipse")}
      aria-describedby={description ? descriptionId : undefined}
      // `relative` : la description `sr-only` (en absolu) se place dans
      // l'ellipse. Sans lui, elle se calait sur un conteneur hors du fil,
      // au-delà de sa zone de défilement : seconde barre et grand vide dessous.
      className="group/gblock relative w-full py-4"
    >
      {description && <span id={descriptionId} className="sr-only">{description}</span>}
      {date && (
        <p aria-hidden className="mb-1 text-xs text-muted-foreground">
          {date}
        </p>
      )}
      {ellipse ? (
        <div className="relative">
          <ChatroomDayStrip
            day={{
              icon: ellipse.to_icon,
              position: ellipse.to_position,
              fromIcon: ellipse.days > 0 ? ellipse.from_icon : null,
              fromPosition: ellipse.days > 0 ? ellipse.from_position : null,
              skipped: ellipse.days,
            }}
          />
          {/* Posé sur la barre, au bout : `top-5` est le milieu de la ligne
              (hauteur utile de la bande : 40 px). */}
          <GameBlockToolbar
            mine={mine}
            onDelete={onDelete}
            className="absolute top-5 right-0 -translate-y-1/2 rounded-md bg-background"
          />
        </div>
      ) : (
        <GameBlockToolbar mine={mine} onDelete={onDelete} />
      )}
    </article>
  );
}
