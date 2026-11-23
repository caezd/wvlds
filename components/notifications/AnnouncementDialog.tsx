"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { SectionLabel } from "@/components/ui/section-label";
import { Badge } from "@/components/ui/badge";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import DateDisplay from "@/components/date-display";
import type { AppNotification } from "@/types/db";
import { AnnouncementImage, AnnouncementLabelBadge } from "@/components/worlds/announcements/AnnouncementLabelBadge";

/**
 * Une annonce de l'équipe d'un monde (migration 227), lue en entier : la
 * notification n'en montre que le titre, le texte voyage dans `metadata.body`.
 */
export function AnnouncementDialog({
    notif,
    worldName,
    open,
    onOpenChange,
    onNavigate,
}: {
    notif: AppNotification;
    worldName: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Appelé en suivant le lien vers le monde (fermer le panneau, par exemple). */
    onNavigate?: () => void;
}) {
    const t = useTranslations("notifications");
    const world = worldName ?? notif.metadata?.world_name ?? null;
    const body = notif.metadata?.body ?? "";
    // Essai que l'auteur s'est envoyé (migration 228) ; un message privé
    // essayé n'a pas de titre.
    const isTest = notif.metadata?.test === true;
    const title = notif.content
        ?? (isTest && notif.metadata?.kind === "message" ? t("announcement.testMessageTitle") : t("announcement.fallbackTitle"));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg" data-testid="announcement-dialog">
                <DialogHeader>
                    {(world || isTest) && (
                        <div className="flex items-center gap-2">
                            {world && (
                                <SectionLabel as="div" className="flex min-w-0 items-center gap-1.5">
                                    <Megaphone className="size-3.5" aria-hidden />
                                    <span className="truncate">{world}</span>
                                </SectionLabel>
                            )}
                            {isTest && <Badge data-testid="announcement-test-badge">{t("announcement.test")}</Badge>}
                        </div>
                    )}
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                        {title}
                        <AnnouncementLabelBadge label={notif.metadata?.label} />
                    </DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-x-1.5">
                        <span>{t("announcement.from", { actor: notif.actor_name ?? t("text.someone") })}</span>
                        <span>·</span>
                        <DateDisplay value={notif.created_at} />
                        {notif.metadata?.edited && (
                            <>
                                <span>·</span>
                                <span data-testid="announcement-dialog-edited">{t("announcement.edited")}</span>
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>
                <AnnouncementImage src={notif.metadata?.image_url} />
                {body && (
                    <div className="max-h-[60vh] overflow-y-auto">
                        <MarkdownRenderer content={body} />
                    </div>
                )}
                {notif.world_id && (
                    <DialogFooter>
                        <Button asChild variant="outline">
                            <Link href={`/w/${notif.world_id}`} onClick={() => { onOpenChange(false); onNavigate?.(); }}>
                                {t("announcement.openWorld")}
                            </Link>
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
