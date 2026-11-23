"use client";

import { useTranslations } from "next-intl";
import { CalendarDays, Info, ScrollText, TriangleAlert, Wrench, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isAnnouncementLabel, type AnnouncementLabel } from "@/lib/worldAnnouncements";

/** Le ton de chaque étiquette (migration 235) : le sens, pas une couleur libre. */
export const ANNOUNCEMENT_LABEL_TONE = {
  info: "info",
  event: "accent",
  rules: "neutral",
  maintenance: "warning",
  important: "danger",
} as const satisfies Record<AnnouncementLabel, "info" | "accent" | "neutral" | "warning" | "danger">;

/** L'icône de chaque étiquette, partout où elle paraît. */
export const ANNOUNCEMENT_LABEL_ICON: Record<AnnouncementLabel, LucideIcon> = {
  info: Info,
  event: CalendarDays,
  rules: ScrollText,
  maintenance: Wrench,
  important: TriangleAlert,
};

/** La pastille d'étiquette d'une annonce, icône et ton ; rien pour une valeur inconnue. */
export function AnnouncementLabelBadge({ label, className }: { label: string | null | undefined; className?: string }) {
  const t = useTranslations("worlds.announcements.labels");
  if (!isAnnouncementLabel(label)) return null;
  const Icon = ANNOUNCEMENT_LABEL_ICON[label];
  return (
    <Badge tone={ANNOUNCEMENT_LABEL_TONE[label]} className={className} data-testid="announcement-label" data-label={label}>
      <Icon aria-hidden />
      {t(label)}
    </Badge>
  );
}

/** L'image d'en-tête d'une annonce, au format bannière. */
export function AnnouncementImage({ src, className }: { src: string | null | undefined; className?: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- image du stockage public, dimensions libres
    <img
      src={src}
      alt=""
      loading="lazy"
      data-testid="announcement-image"
      className={["aspect-[16/7] w-full rounded-md object-cover", className].filter(Boolean).join(" ")}
    />
  );
}
