"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { BookOpenText, Eye, Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { notifText } from "@/lib/notifHelpers";
import { renderAnnouncement, type AnnouncementKind, type AnnouncementVariable } from "@/lib/worldAnnouncements";
import type { AppNotification } from "@/types/db";
import { BannerCard } from "@/components/worlds/home/WorldAnnouncementBanners";
import { HomeAnnouncementRow } from "@/components/worlds/home/widgets/WorldLatestAnnouncementsWidget";
import { AnnouncementImage, AnnouncementLabelBadge } from "@/components/worlds/announcements/AnnouncementLabelBadge";
import type { AnnouncementExtrasValue } from "@/components/worlds/announcements/AnnouncementExtrasFields";

export type AnnouncementPreviewProps = {
  kind: AnnouncementKind;
  /** Titre et texte bruts : les variables sont remplacées ici. */
  title: string;
  body: string;
  sample: Record<AnnouncementVariable, string>;
  worldName: string;
  /** Signée par le monde plutôt que par l'auteur. */
  asWorld: boolean;
  extras: AnnouncementExtrasValue;
  /** Message de bienvenue : la cloche le dit, sans parler d'annonce. */
  welcome?: boolean;
  /** Page du wiki liée au message de bienvenue (migration 264). */
  wikiPage?: { title: string } | null;
};

/** Un endroit où l'annonce paraît, sous sa légende. */
function Place({ caption, children, testId }: { caption: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <SectionLabel as="p">{caption}</SectionLabel>
      <div className="rounded-lg border border-border bg-background p-3">{children}</div>
    </div>
  );
}

/**
 * Ce que verront les destinataires, à chaque endroit où l'annonce paraît :
 * la cloche puis la notification ouverte, le bandeau de l'accueil, ou le
 * message privé ; et l'entrée du widget « Dernières annonces » si elle est
 * affichée sur l'accueil. Mêmes composants que l'affichage réel (bandeau,
 * ligne du widget, étiquette, image), avec les valeurs de l'auteur à la
 * place des variables.
 */
export function AnnouncementLivePreview({
  kind,
  title: rawTitle,
  body: rawBody,
  sample,
  worldName,
  asWorld,
  extras,
  welcome = false,
  wikiPage = null,
  testId = "announcement-preview",
}: AnnouncementPreviewProps & { testId?: string }) {
  const t = useTranslations("worlds.announcements");
  const tNotif = useTranslations("notifications");
  const title = renderAnnouncement(rawTitle, sample).trim();
  const body = renderAnnouncement(rawBody, sample).trim();
  const signer = asWorld ? worldName : sample.username;
  const shownTitle = title || t("previewEmpty");
  const now = React.useMemo(() => new Date().toISOString(), []);

  // La ligne de la cloche, par le même texte que le vrai panneau.
  const bellNotif = {
    type: "world_announcement",
    actor_name: signer,
    content: shownTitle,
    metadata: welcome ? { welcome: true } : {},
  } as unknown as AppNotification;

  return (
    <div className="space-y-4" data-testid={testId} data-kind={kind}>
      {kind === "notification" && (
        <>
          <Place caption={t("previewInBell")} testId={`${testId}-bell`}>
            <div className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs-plus font-semibold text-muted-foreground">
                {signer.charAt(0).toUpperCase() || <Megaphone className="size-3.5" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <SectionLabel as="div" className="mb-0.5 truncate">{worldName}</SectionLabel>
                <p className="text-sm leading-snug text-foreground">{notifText(bellNotif, tNotif)}</p>
                <p className="mt-1 text-xs-plus text-muted-foreground">{t("justNow")}</p>
              </div>
            </div>
          </Place>
          <Place caption={t("previewOpened")} testId={`${testId}-opened`}>
            <div className="space-y-3">
              <SectionLabel as="div" className="flex min-w-0 items-center gap-1.5">
                <Megaphone className="size-3.5" aria-hidden />
                <span className="truncate">{worldName}</span>
              </SectionLabel>
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-tight">
                {shownTitle}
                <AnnouncementLabelBadge label={extras.label} />
              </p>
              <p className="text-sm text-muted-foreground">
                {tNotif("announcement.from", { actor: signer })} · {t("justNow")}
              </p>
              <AnnouncementImage src={extras.imageUrl} />
              {body ? <MarkdownRenderer content={body} /> : null}
              {wikiPage && (
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" tabIndex={-1} className="pointer-events-none">
                    <BookOpenText className="h-4 w-4" />
                    {wikiPage.title}
                  </Button>
                </div>
              )}
            </div>
          </Place>
        </>
      )}

      {kind === "banner" && (
        <Place caption={t("previewBanner")} testId={`${testId}-banner-place`}>
          <BannerCard
            title={shownTitle}
            body={body}
            signer={signer}
            label={extras.label}
            imageUrl={extras.imageUrl}
            testId={`${testId}-banner`}
          />
        </Place>
      )}

      {kind === "message" && (
        <Place caption={t("previewMessage")} testId={`${testId}-message`}>
          <p className="w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-sm">
            {body || t("previewEmpty")}
          </p>
          {(extras.label || extras.imageUrl) && (
            <p className="mt-2 text-xs-plus text-muted-foreground">{t("previewMessageExtras")}</p>
          )}
        </Place>
      )}

      {extras.showOnHome && (
        <Place caption={t("previewHome")} testId={`${testId}-home`}>
          <HomeAnnouncementRow
            announcement={{
              title: kind === "message" ? null : shownTitle,
              body: body || t("previewEmpty"),
              label: extras.label,
              pinned: extras.pinned,
              signer,
              created_at: now,
              edited_at: null,
            }}
          />
        </Place>
      )}
    </div>
  );
}

/** Le bouton « Aperçu » et sa fenêtre. */
export function AnnouncementPreviewButton(props: AnnouncementPreviewProps & { disabled?: boolean; dialogTitle?: string }) {
  const t = useTranslations("worlds.announcements");
  const [open, setOpen] = React.useState(false);
  const { disabled, dialogTitle, ...preview } = props;
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={disabled} data-testid="announcement-preview-open">
        <Eye className="h-4 w-4" />
        {t("previewOpen")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[100dvh] max-w-lg overflow-y-auto" data-testid="announcement-preview-dialog">
          <DialogHeader>
            <DialogTitle>{dialogTitle ?? t("previewTitle")}</DialogTitle>
            <DialogDescription>{t("previewHelp")}</DialogDescription>
          </DialogHeader>
          {open && <AnnouncementLivePreview {...preview} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
