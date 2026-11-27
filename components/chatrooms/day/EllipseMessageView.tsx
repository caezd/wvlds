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
 * auteur. Le saut se lit dans la ligne `chatroom_ellipses` jointe au
 * message, jamais dans son texte ; les jours passés et la date atteinte
 * décrivent la ligne (lecteur d'écran, infobulle).
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
      title={description ?? undefined}
      className="group/gblock relative w-full py-4"
    >
      {description && <span id={descriptionId} className="sr-only">{description}</span>}
      {ellipse && (
        <ChatroomDayStrip
          day={{
            icon: ellipse.to_icon,
            position: ellipse.to_position,
            fromIcon: ellipse.days > 0 ? ellipse.from_icon : null,
            fromPosition: ellipse.days > 0 ? ellipse.from_position : null,
            skipped: ellipse.days,
          }}
        />
      )}
      <GameBlockToolbar mine={mine} onDelete={onDelete} className="absolute top-1 right-0" />
    </article>
  );
}
