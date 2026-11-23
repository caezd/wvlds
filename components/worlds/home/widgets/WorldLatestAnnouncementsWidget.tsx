"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Megaphone, Pin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { topic, useTopic } from "@/lib/realtimeHub";
import { relativeTime } from "@/lib/relativeTime";
import { markdownToPlainText } from "@/lib/markdownToPlainText";
import { fetchHomeAnnouncements, type HomeAnnouncement } from "@/lib/worldAnnouncements";
import { SectionLabel } from "@/components/ui/section-label";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import DateDisplay from "@/components/date-display";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnnouncementImage, AnnouncementLabelBadge } from "@/components/worlds/announcements/AnnouncementLabelBadge";

const DEFAULT_LIMIT = 3;

/**
 * Une annonce dans la liste du widget : épingle, titre, étiquette, début du
 * texte, signature. Cliquable dans le widget ; inerte dans l'aperçu du
 * formulaire d'annonce (sans `onOpen`).
 */
export function HomeAnnouncementRow({
  announcement: a,
  onOpen,
}: {
  announcement: Pick<HomeAnnouncement, "title" | "body" | "label" | "pinned" | "signer" | "created_at" | "edited_at">;
  onOpen?: () => void;
}) {
  const t = useTranslations("worlds.announcements");
  const locale = useLocale();
  const inner = (
    <>
      <span className="flex items-center gap-2">
        {a.pinned && <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("pinned")} />}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.title ?? markdownToPlainText(a.body)}</span>
        <AnnouncementLabelBadge label={a.label} />
      </span>
      {a.title && <span className="line-clamp-2 text-xs-plus text-muted-foreground">{markdownToPlainText(a.body)}</span>}
      <span className="block text-xs text-muted-foreground">
        {[a.signer, relativeTime(a.created_at, locale, t("justNow")), a.edited_at ? t("edited") : null]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </>
  );
  const className = "block w-full space-y-1 rounded-md px-2.5 py-2 text-left";
  if (!onOpen) {
    return (
      <div className={className} data-testid="latest-announcement">
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${className} transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none`}
      data-testid="latest-announcement"
    >
      {inner}
    </button>
  );
}

/**
 * « Dernières annonces » sur l'accueil d'un monde (migration 235) : les
 * annonces que l'équipe a choisi d'y afficher, épinglées d'abord. Visible de
 * tous les membres, quel que soit le ciblage de l'envoi — c'est le sens de la
 * case « Afficher sur l'accueil ». Suit le canal du monde (avis
 * `announcement`) et se relit au retour d'une coupure.
 */
export function WorldLatestAnnouncementsWidget({
  worldId,
  limit = DEFAULT_LIMIT,
  initialAnnouncements,
}: {
  worldId: string;
  /** Nombre d'annonces listées — réglage du widget. */
  limit?: number;
  /** Résolues côté serveur (WorldHomeContent) ; absentes, le widget charge au montage. */
  initialAnnouncements?: HomeAnnouncement[];
}) {
  const t = useTranslations("worlds.announcements");
  const tHome = useTranslations("worlds.home");
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<HomeAnnouncement[]>(initialAnnouncements ?? []);
  const [opened, setOpened] = useState<HomeAnnouncement | null>(null);
  const hasServerData = initialAnnouncements !== undefined;

  const load = useCallback(async () => {
    setItems(await fetchHomeAnnouncements(supabase, worldId, limit));
  }, [supabase, worldId, limit]);

  useEffect(() => {
    if (!hasServerData) void load();
  }, [hasServerData, load]);

  useTopic(topic.world(worldId), ({ event }) => {
    if (event === "announcement") void load();
    // Retour d'une coupure : les avis manqués ne reviendront pas, on relit.
  }, { onResync: () => void load() });

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border p-3" data-testid="latest-announcements">
      <SectionLabel as="p" className="mb-2.5 flex items-center gap-1.5">
        <Megaphone className="size-3.5" aria-hidden />
        {tHome("widgets.latest_announcements")}
      </SectionLabel>
      <ul className="space-y-1">
        {items.map((a) => (
          <li key={a.id}>
            <HomeAnnouncementRow announcement={a} onOpen={() => setOpened(a)} />
          </li>
        ))}
      </ul>

      <Dialog open={!!opened} onOpenChange={(o) => !o && setOpened(null)}>
        <DialogContent className="max-h-[100dvh] max-w-lg overflow-y-auto" data-testid="latest-announcement-dialog">
          {opened && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {opened.title ?? t("kindMessage")}
                  <AnnouncementLabelBadge label={opened.label} />
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-1.5">
                  {opened.signer && <span>{t("signedBy", { name: opened.signer })}</span>}
                  {opened.signer && <span>·</span>}
                  <DateDisplay value={opened.created_at} />
                  {opened.edited_at && (
                    <>
                      <span>·</span>
                      <span>{t("edited")}</span>
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <AnnouncementImage src={opened.image_url} />
              <MarkdownRenderer content={opened.body} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
