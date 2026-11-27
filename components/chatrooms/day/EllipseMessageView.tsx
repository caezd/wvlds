"use client";

import { Ellipsis } from "lucide-react";
import { useTranslations } from "next-intl";

import { GameBlockToolbar } from "@/components/chatrooms/blocks/GameBlockShell";
import type { ChatroomEllipse } from "@/lib/chatroomDay";
import { formatTimelineLabel } from "@/lib/worldTimeline";
import { ChatroomDayStrip } from "./ChatroomDayStrip";
import { useChatroomTime } from "./chatroomTime";

/**
 * Un message « Ellipse » (migration 275) : le saut se lit dans la ligne
 * `chatroom_ellipses` jointe au message, jamais dans son texte.
 */
export function EllipseMessageView({
  ellipse,
  label,
  mine,
  onDelete,
}: {
  ellipse: ChatroomEllipse | null | undefined;
  label: string;
  mine: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations("chatrooms.dayStatus");
  const { config } = useChatroomTime();
  const date = ellipse?.to_date && config && ellipse.days > 0 ? formatTimelineLabel(config, ellipse.to_date) : null;

  return (
    <article aria-label={t("ellipse")} className="group/gblock w-full py-3">
      <div className="flex items-center justify-between gap-4">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
          <Ellipsis className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-semibold">{t("ellipse")}</span>
          <span className="text-muted-foreground">
            · <strong className="font-medium text-foreground">{label}</strong>
            {ellipse && <> · {t("later", { count: ellipse.days })}</>}
            {date && <> · {date}</>}
          </span>
        </p>
        <GameBlockToolbar mine={mine} onDelete={onDelete} className="shrink-0" />
      </div>
      {ellipse && (
        <ChatroomDayStrip
          className="mt-1"
          day={{
            icon: ellipse.to_icon,
            position: ellipse.to_position,
            fromIcon: ellipse.days > 0 ? ellipse.from_icon : null,
            fromPosition: ellipse.days > 0 ? ellipse.from_position : null,
            skipped: ellipse.days,
          }}
        />
      )}
    </article>
  );
}
