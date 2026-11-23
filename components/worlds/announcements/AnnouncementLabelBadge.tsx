"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { isAnnouncementLabel, type AnnouncementLabel } from "@/lib/worldAnnouncements";

/** Le ton de chaque étiquette (migration 235) : le sens, pas une couleur libre. */
const TONE = {
  info: "info",
  event: "accent",
  rules: "neutral",
  maintenance: "warning",
  important: "danger",
} as const satisfies Record<AnnouncementLabel, "info" | "accent" | "neutral" | "warning" | "danger">;

/** La pastille d'étiquette d'une annonce ; rien pour une valeur inconnue. */
export function AnnouncementLabelBadge({ label, className }: { label: string | null | undefined; className?: string }) {
  const t = useTranslations("worlds.announcements.labels");
  if (!isAnnouncementLabel(label)) return null;
  return (
    <Badge tone={TONE[label]} className={className} data-testid="announcement-label" data-label={label}>
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
