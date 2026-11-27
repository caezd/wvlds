"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NumberInput } from "@/components/ui/number-input";
import { SectionLabel } from "@/components/ui/section-label";
import {
  DAY_DEFAULT_ICON,
  DAY_DEFAULT_POSITION,
  ELLIPSE_MAX_DAYS,
  addTimelineDays,
  type EllipseRequest,
} from "@/lib/chatroomDay";
import { formatTimelineLabel } from "@/lib/worldTimeline";
import { ChatroomDayPicker } from "./ChatroomDayPicker";
import { ChatroomDayStrip } from "./ChatroomDayStrip";
import { useChatroomTime } from "./chatroomTime";

/**
 * Le bloc « Ellipse » du composeur : faire passer le temps du salon. On
 * choisit la météo, le moment de la journée et les jours passés ; l'aperçu
 * montre le saut tel qu'il s'affichera.
 */
export function EllipseDialog({
  open,
  onOpenChange,
  onPost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPost: (request: EllipseRequest) => void;
}) {
  const t = useTranslations("chatrooms.dayStatus");
  const { config, startDate, currentDate, day } = useChatroomTime();
  const ids = useId();
  const [icon, setIcon] = useState(day?.icon ?? DAY_DEFAULT_ICON);
  const [position, setPosition] = useState(day?.position ?? DAY_DEFAULT_POSITION);
  const [days, setDays] = useState<number | null>(0);

  // Chaque ouverture repart du temps actuel du salon.
  useEffect(() => {
    if (!open) return;
    setIcon(day?.icon ?? DAY_DEFAULT_ICON);
    setPosition(day?.position ?? DAY_DEFAULT_POSITION);
    setDays(0);
  }, [open, day?.icon, day?.position]);

  const skipped = days ?? 0;
  const from = currentDate ?? startDate;
  const to = config && from && skipped > 0 ? addTimelineDays(config, from, skipped) : null;
  const dateMoves = !!(config && from && to && to !== from);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("ellipse")}</DialogTitle>
          <DialogDescription>{t("ellipseDescription")}</DialogDescription>
        </DialogHeader>

        <ChatroomDayStrip
          day={{
            icon,
            position,
            fromIcon: skipped > 0 ? day?.icon ?? null : null,
            fromPosition: skipped > 0 ? day?.position ?? null : null,
            skipped,
          }}
        />

        <ChatroomDayPicker icon={icon} position={position} onChange={(i, p) => { setIcon(i); setPosition(p); }} />

        <div className="space-y-2">
          <label htmlFor={`${ids}-days`} className="block">
            <SectionLabel as="span">{t("daysPassed")}</SectionLabel>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <NumberInput
              id={`${ids}-days`}
              aria-label={t("daysPassed")}
              value={days}
              onValueChange={setDays}
              min={0}
              max={ELLIPSE_MAX_DAYS}
              className="w-32"
            />
            {dateMoves && config && from && to && (
              <p className="text-sm text-muted-foreground">
                {t("dateHint", { from: formatTimelineLabel(config, from), to: formatTimelineLabel(config, to) })}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              onPost({ days: Math.min(ELLIPSE_MAX_DAYS, Math.max(0, Math.round(skipped))), icon, position });
              onOpenChange(false);
            }}
          >
            {t("post")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
