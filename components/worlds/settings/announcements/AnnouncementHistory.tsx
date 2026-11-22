"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bell, CopyPlus, Landmark, Loader2, MessageSquare, PanelTop, Undo2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import DateDisplay from "@/components/date-display";
import { RoleChip } from "@/components/worlds/members/RoleChip";
import { retractWorldAnnouncement, type AnnouncementKind, type WorldAnnouncement } from "@/lib/worldAnnouncements";
import { FiltersSummary, type RoleLike } from "./AnnouncementFiltersPanel";
import { useAnnouncementErrorMessage } from "./AnnouncementFields";

const KIND_ICON = { message: MessageSquare, notification: Bell, banner: PanelTop } as const;
const KIND_LABEL = { message: "kindMessage", notification: "kindNotification", banner: "kindBanner" } as const;

function KindIcon({ kind, className }: { kind: AnnouncementKind; className: string }) {
  const t = useTranslations("worlds.announcements");
  const Icon = KIND_ICON[kind] ?? Bell;
  return <Icon className={className} aria-label={t(KIND_LABEL[kind] ?? "kindNotification")} />;
}

/** « 3 lectures sur 12 », « Retirée », ou le seul nombre de destinataires sans suivi. */
function ReadBadge({ announcement: a, reads }: { announcement: WorldAnnouncement; reads: number | undefined }) {
  const t = useTranslations("worlds.announcements");
  if (a.retracted_at) {
    return (
      <Badge data-testid="announcement-reads" className="text-muted-foreground">
        {t("retracted")}
      </Badge>
    );
  }
  return (
    <Badge data-testid="announcement-reads">
      {reads === undefined
        ? t("recipientCount", { count: a.recipient_count })
        : t("readCount", { count: reads, total: a.recipient_count })}
    </Badge>
  );
}

function AnnouncementMeta({ announcement: a, roleById }: { announcement: WorldAnnouncement; roleById: Map<string, RoleLike> }) {
  const t = useTranslations("worlds.announcements");
  const targetRoles = a.role_ids.map((id) => roleById.get(id)).filter((r): r is RoleLike => !!r);
  return (
    <>
      <DateDisplay value={a.created_at} />
      <span>·</span>
      <span>{t("by", { name: a.author?.username ?? t("unknownAuthor") })}</span>
      {a.signed_as_world && (
        <span className="inline-flex items-center gap-1" data-testid="announcement-as-world">
          <Landmark className="size-3" aria-hidden />
          {t("signedAsWorld")}
        </span>
      )}
      {a.kind === "banner" && (
        <span>{a.banner_until ? t("bannerUntil", { date: new Date(a.banner_until) }) : t("bannerUntilDismissed")}</span>
      )}
      <span>·</span>
      {targetRoles.length === 0 ? (
        <span>{t("allMembers")}</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {targetRoles.map((r) => (
            <RoleChip key={r.id} role={r} />
          ))}
        </span>
      )}
      <FiltersSummary filters={a.filters} roleById={roleById} />
    </>
  );
}

export function HistoryRow({
  announcement: a,
  roleById,
  reads,
  onOpen,
}: {
  announcement: WorldAnnouncement;
  roleById: Map<string, RoleLike>;
  reads: number | undefined;
  onOpen: () => void;
}) {
  return (
    <li data-testid="announcement-row">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full space-y-1.5 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      >
        <span className="flex items-center gap-2 text-sm">
          <KindIcon kind={a.kind} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{a.title ?? a.body}</span>
          <ReadBadge announcement={a} reads={reads} />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs-plus text-muted-foreground">
          <AnnouncementMeta announcement={a} roleById={roleById} />
        </span>
      </button>
    </li>
  );
}

/**
 * Une annonce envoyée, en entier : la reprendre dans le formulaire, ou, pour
 * une notification, la retirer des cloches (migration 229) ; pour un bandeau,
 * le retirer de l'accueil (230).
 */
export function AnnouncementDetails({
  announcement: a,
  roleById,
  reads,
  onOpenChange,
  onReuse,
  onRetracted,
  onCloseAutoFocus,
}: {
  announcement: WorldAnnouncement | null;
  roleById: Map<string, RoleLike>;
  reads: number | undefined;
  onOpenChange: (open: boolean) => void;
  onReuse: (a: WorldAnnouncement) => void;
  onRetracted: () => void;
  onCloseAutoFocus: (e: Event) => void;
}) {
  const t = useTranslations("worlds.announcements");
  const tCommon = useTranslations("common");
  const errorMessage = useAnnouncementErrorMessage();
  const supabase = React.useMemo(() => createClient(), []);
  // Garde le contenu affiché le temps de l'animation de fermeture.
  const [shown, setShown] = React.useState(a);
  const [confirmRetract, setConfirmRetract] = React.useState(false);
  const [retracting, setRetracting] = React.useState(false);
  if (a && a !== shown) {
    setShown(a);
    setConfirmRetract(false);
  }
  const current = a ?? shown;
  const canRetract = !!current && current.kind !== "message" && !current.retracted_at;
  const isBanner = current?.kind === "banner";

  async function retract() {
    if (!current) return;
    setRetracting(true);
    const res = await retractWorldAnnouncement(supabase, current.id);
    setRetracting(false);
    setConfirmRetract(false);
    if (!res.ok) {
      toast.error(errorMessage(res.reason));
      return;
    }
    toast.success(isBanner ? t("retractedBannerToast", { count: res.removed }) : t("retractedToast", { count: res.removed }));
    onRetracted();
  }

  return (
    <Dialog open={!!a} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="announcement-details" onCloseAutoFocus={onCloseAutoFocus}>
        {current && (
          <>
            <DialogHeader>
              <SectionLabel as="div" className="flex items-center gap-1.5">
                {(() => {
                  const Icon = KIND_ICON[current.kind] ?? Bell;
                  return <Icon className="size-3.5" aria-hidden />;
                })()}
                {t(KIND_LABEL[current.kind] ?? "kindNotification")}
              </SectionLabel>
              <DialogTitle>{current.title ?? t("kindMessage")}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <AnnouncementMeta announcement={current} roleById={roleById} />
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border bg-background p-4">
              {current.kind !== "message" ? (
                <MarkdownRenderer content={current.body} />
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm">{current.body}</p>
              )}
            </div>
            {confirmRetract ? (
              <div className="space-y-3 rounded-md border border-border bg-card p-3" data-testid="announcement-retract-confirm">
                <p className="text-sm">
                  {isBanner
                    ? t("retractBannerConfirm", { count: current.recipient_count })
                    : t("retractConfirm", { count: current.recipient_count })}
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRetract(false)} disabled={retracting}>
                    {tCommon("cancel")}
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => void retract()} disabled={retracting}>
                    {retracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                    {t("retract")}
                  </Button>
                </div>
              </div>
            ) : (
              <DialogFooter className="items-center sm:justify-between">
                <ReadBadge announcement={current} reads={reads} />
                <div className="flex flex-wrap justify-end gap-2">
                  {canRetract && (
                    <Button type="button" variant="outline" onClick={() => setConfirmRetract(true)} data-testid="announcement-retract">
                      <Undo2 className="h-4 w-4" />
                      {t("retract")}
                    </Button>
                  )}
                  <Button type="button" onClick={() => onReuse(current)} data-testid="announcement-reuse">
                    <CopyPlus className="h-4 w-4" />
                    {t("reuse")}
                  </Button>
                </div>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
