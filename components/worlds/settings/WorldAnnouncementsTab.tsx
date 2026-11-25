"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarClock, Eye, Loader2, Megaphone, Send, SlidersHorizontal, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CountPip } from "@/components/ui/count-pip";
import { SectionLabel } from "@/components/ui/section-label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RoleChip } from "@/components/worlds/members/RoleChip";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_DAILY_LIMIT,
  ANNOUNCEMENT_TITLE_MAX,
  BANNER_DAY_OPTIONS,
  compactFilters,
  countAnnouncementRecipients,
  fetchAnnouncementReadCounts,
  fetchScheduledAnnouncements,
  fetchWorldAnnouncements,
  hasFilters,
  scheduleWorldAnnouncement,
  sendWorldAnnouncement,
  type AnnouncementFilters,
  type AnnouncementKind,
  type ScheduledAnnouncement,
  type WorldAnnouncement,
} from "@/lib/worldAnnouncements";
import { FIELD, SettingsSection, ToggleItem, ToggleList } from "./FeatureLayout";
import { AnnouncementTestButton, BodyEditor, KindPicker, isAnnouncementValid, useAnnouncementErrorMessage } from "./announcements/AnnouncementFields";
import { AnnouncementFiltersPanel } from "./announcements/AnnouncementFiltersPanel";
import { AnnouncementDetails, HistoryRow } from "./announcements/AnnouncementHistory";
import { AnnouncementLivePreview, AnnouncementPreviewButton } from "./announcements/AnnouncementLivePreview";
import { ScheduleDialog, ScheduledList } from "./announcements/ScheduledAnnouncements";
import {
  AnnouncementExtrasFields,
  EMPTY_EXTRAS,
  type AnnouncementExtrasValue,
} from "@/components/worlds/announcements/AnnouncementExtrasFields";
import { useAnnouncementImageDrafts } from "@/components/worlds/announcements/useAnnouncementImageDrafts";
import { isAnnouncementLabel } from "@/lib/worldAnnouncements";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Onglet « Annonces » : écrire à tous les membres du monde, ou aux porteurs de
 * certains rôles, par message privé ou par notification (migration 227).
 * Réservé à `members.announce` ; la base fait foi (permission, plafond
 * journalier, blocages). Essai à soi-même et lectures (migration 228) ;
 * filtres, retrait d'une notification et message de bienvenue (229) ;
 * bandeau, signature du monde et envois programmés (230).
 */
export function WorldAnnouncementsTab({ worldId, worldName }: { worldId: string; worldName: string }) {
  const t = useTranslations("worlds.announcements");
  const tCommon = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);
  const { direct_messages: dmsEnabled } = useFeatureFlags();
  const { roles } = useWorldMembership();
  const { username } = useCurrentUser();
  const errorMessage = useAnnouncementErrorMessage();

  const [kind, setKind] = React.useState<AnnouncementKind>(dmsEnabled ? "message" : "notification");
  const [roleIds, setRoleIds] = React.useState<string[]>([]);
  const [filters, setFilters] = React.useState<AnnouncementFilters>({});
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [asWorld, setAsWorld] = React.useState(false);
  // Bandeau : jours d'affichage ; null, jusqu'à ce qu'on le ferme.
  const [bannerDays, setBannerDays] = React.useState<number | null>(null);
  // Étiquette, image, accueil, épingle (migration 235).
  const [extras, setExtras] = React.useState<AnnouncementExtrasValue>(EMPTY_EXTRAS);
  const images = useAnnouncementImageDrafts(extras.imageUrl);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduled, setScheduled] = React.useState<ScheduledAnnouncement[]>([]);
  const [sending, setSending] = React.useState(false);
  const [recipients, setRecipients] = React.useState<number | null>(null);
  const [history, setHistory] = React.useState<WorldAnnouncement[] | null>(null);
  const [reads, setReads] = React.useState<Map<string, number>>(() => new Map());
  const [opened, setOpened] = React.useState<WorldAnnouncement | null>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const formRef = React.useRef<HTMLDivElement>(null);
  // Après « Réutiliser », le focus va au message plutôt qu'à la ligne cliquée.
  const focusFormOnClose = React.useRef(false);

  // Le drapeau peut s'éteindre pendant que l'onglet est ouvert.
  React.useEffect(() => {
    if (!dmsEnabled && kind === "message") setKind("notification");
  }, [dmsEnabled, kind]);

  const loadHistory = React.useCallback(async () => {
    const list = await fetchWorldAnnouncements(supabase, worldId);
    setHistory(list);
    setReads(await fetchAnnouncementReadCounts(supabase, worldId, list.map((a) => a.id)));
  }, [supabase, worldId]);

  React.useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const loadScheduled = React.useCallback(async () => {
    setScheduled(await fetchScheduledAnnouncements(supabase, worldId));
  }, [supabase, worldId]);

  React.useEffect(() => {
    void loadScheduled();
  }, [loadScheduled]);

  // Le compte suit le type (les blocages ne comptent que pour un message
  // privé), les rôles visés et les filtres.
  const roleKey = roleIds.join(",");
  const filterKey = JSON.stringify(compactFilters(filters));
  React.useEffect(() => {
    let cancelled = false;
    setRecipients(null);
    void countAnnouncementRecipients(supabase, worldId, kind, roleKey ? roleKey.split(",") : [], JSON.parse(filterKey)).then((n) => {
      if (!cancelled) setRecipients(n);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId, kind, roleKey, filterKey]);

  const sentToday = (history ?? []).filter((a) => Date.now() - new Date(a.created_at).getTime() < DAY_MS).length;
  const limitReached = sentToday >= ANNOUNCEMENT_DAILY_LIMIT;
  const valid = isAnnouncementValid(kind, title, body);
  const canSend = valid && !sending && !limitReached && (recipients ?? 0) > 0;
  // Programmer ne dépend pas du plafond du jour : il se vérifie à l'envoi.
  const canSchedule = valid && !sending;
  const signable = kind !== "message";
  const activeFilters = Object.keys(compactFilters(filters)).length;

  const roleById = React.useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const sample = { username: username ?? t("sampleUsername"), world: worldName };
  // L'aperçu (fenêtre et colonne en direct) : ce que verront les destinataires.
  const previewProps = { kind, title, body, sample, worldName, asWorld: signable && asWorld, extras };

  // Un rôle visé ne peut pas être exclu en même temps, et inversement.
  function toggleRole(id: string) {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
    setFilters((f) => ({ ...f, exclude_role_ids: (f.exclude_role_ids ?? []).filter((r) => r !== id) }));
  }
  function changeFilters(next: AnnouncementFilters) {
    const excluded = next.exclude_role_ids ?? [];
    setRoleIds((prev) => prev.filter((r) => !excluded.includes(r)));
    setFilters(next);
  }

  /** Reprend une annonce de l'historique dans le formulaire. */
  function reuse(a: WorldAnnouncement) {
    setKind(a.kind === "message" && !dmsEnabled ? "notification" : a.kind);
    setTitle(a.title ?? "");
    setBody(a.body);
    setAsWorld(!!a.signed_as_world);
    setBannerDays(
      a.kind === "banner" && a.banner_until
        ? Math.max(1, Math.round((new Date(a.banner_until).getTime() - new Date(a.created_at).getTime()) / DAY_MS))
        : null,
    );
    // Un rôle supprimé depuis ne se rattrape pas ; sans rôle restant, tous.
    setRoleIds(a.role_ids.filter((id) => roleById.has(id)));
    const reused = {
      ...a.filters,
      exclude_role_ids: (a.filters?.exclude_role_ids ?? []).filter((id) => roleById.has(id)),
    };
    setFilters(reused);
    setFiltersOpen(hasFilters(reused));
    setExtras({
      label: isAnnouncementLabel(a.label) ? a.label : null,
      imageUrl: a.image_url ?? null,
      showOnHome: !!a.show_on_home,
      pinned: !!a.pinned_at,
    });
    focusFormOnClose.current = true;
    setOpened(null);
    toast.success(t("reused"));
  }

  async function send() {
    setConfirmOpen(false);
    setSending(true);
    const res = await sendWorldAnnouncement(supabase, { worldId, kind, title, body, roleIds, filters, asWorld, bannerDays, extras });
    setSending(false);
    if (!res.ok) {
      toast.error(errorMessage(res.reason));
      return;
    }
    if (res.recipients === 0) {
      toast.error(t("errorNoRecipients"));
      return;
    }
    toast.success(t("sent", { count: res.recipients }));
    images.keep(extras.imageUrl);
    resetDraft();
    void loadHistory();
  }

  function resetDraft() {
    setTitle("");
    setBody("");
    setExtras(EMPTY_EXTRAS);
  }

  async function schedule(when: Date): Promise<boolean> {
    const res = await scheduleWorldAnnouncement(supabase, {
      worldId,
      kind,
      title,
      body,
      roleIds,
      filters,
      asWorld,
      bannerDays,
      extras,
      scheduledFor: when,
    });
    if (!res.ok) {
      toast.error(errorMessage(res.reason));
      return false;
    }
    toast.success(t("scheduled"));
    images.keep(extras.imageUrl);
    resetDraft();
    void loadScheduled();
    return true;
  }

  return (
    <div className="@container/announcements space-y-6" data-testid="announcements-tab">
      {/* Le formulaire ; à sa droite, quand la place le permet, l'aperçu en
          direct, qui reste visible pendant qu'on descend dans le formulaire. */}
      <div className="grid gap-10 @4xl/announcements:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="@container min-w-0 space-y-6">
      <div ref={formRef} className="scroll-mt-6" />
      {/* ── Type ─────────────────────────────────────────── */}
      <SettingsSection title={t("kind")} help={t("kindHelp")}>
        <KindPicker kind={kind} onChange={setKind} dmsEnabled={dmsEnabled} />
      </SettingsSection>

      {/* ── Destinataires ────────────────────────────────── */}
      <SettingsSection
        title={t("recipients")}
        help={t("recipientsHelp")}
        meta={
          <span data-testid="announcement-recipient-count" data-state={recipients === null ? "loading" : "ready"}>
            {recipients === null ? t("counting") : t("recipientCount", { count: recipients })}
          </span>
        }
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={roleIds.length === 0}
            onClick={() => setRoleIds([])}
          >
            <Users className="h-3.5 w-3.5" />
            {t("allMembers")}
          </Button>
          {roles.map((role) => (
            <Button
              key={role.id}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={roleIds.includes(role.id)}
              onClick={() => toggleRole(role.id)}
            >
              <RoleChip role={role} plain />
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
            data-testid="announcement-filters-toggle"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t("refine")}
            {activeFilters > 0 && <CountPip count={activeFilters} />}
          </Button>
        </div>
        {filtersOpen && <AnnouncementFiltersPanel roles={roles} filters={filters} onChange={changeFilters} />}
      </SettingsSection>

      {/* ── Titre (notification, bandeau) ────────────────── */}
      {kind !== "message" && (
        <SettingsSection title={t("titleLabel")}>
          <Input
            value={title}
            maxLength={ANNOUNCEMENT_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            aria-label={t("titleLabel")}
            data-testid="announcement-title"
            className={FIELD}
          />
        </SettingsSection>
      )}

      {/* ── Options : signature, durée du bandeau ────────── */}
      {signable && (
        <SettingsSection title={t("options")}>
          <ToggleList>
            <ToggleItem
              title={t("asWorld")}
              help={t("asWorldHelp")}
              checked={asWorld}
              onCheckedChange={setAsWorld}
            />
            {kind === "banner" && (
              <ToggleItem
                title={t("bannerDuration")}
                help={t("bannerDurationHelp")}
                control={
                  <div className="flex flex-wrap justify-end gap-1.5" role="group" aria-label={t("bannerDuration")}>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      aria-pressed={bannerDays === null}
                      onClick={() => setBannerDays(null)}
                      data-testid="banner-days"
                      data-days="0"
                    >
                      {t("bannerUntilDismissed")}
                    </Button>
                    {BANNER_DAY_OPTIONS.map((d) => (
                      <Button
                        key={d}
                        type="button"
                        variant="outline"
                        size="xs"
                        aria-pressed={bannerDays === d}
                        onClick={() => setBannerDays(d)}
                        data-testid="banner-days"
                        data-days={d}
                      >
                        {t("filterDays", { count: d })}
                      </Button>
                    ))}
                  </div>
                }
              />
            )}
          </ToggleList>
        </SettingsSection>
      )}

      {/* ── Présentation : étiquette, image, accueil ───────── */}
      <SettingsSection title={t("presentation")} help={t("presentationHelp")}>
        <AnnouncementExtrasFields value={extras} onChange={setExtras} onUploaded={images.track} />
      </SettingsSection>

      {/* ── Message ──────────────────────────────────────── */}
      <SettingsSection
        title={t("body")}
        help={
          kind === "notification"
            ? t("bodyHelpNotification")
            : kind === "banner"
              ? t("bodyHelpBanner")
              : t("bodyHelpMessage")
        }
        meta={`${body.length} / ${ANNOUNCEMENT_BODY_MAX}`}
      >
        <BodyEditor
          kind={kind}
          title={title}
          body={body}
          onBodyChange={setBody}
          preview={false}
          sample={sample}
          worldName={worldName}
          asWorld={signable && asWorld}
          bodyRef={bodyRef}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {limitReached && (
            <span className="mr-auto text-sm text-muted-foreground">{t("errorRateLimit", { count: ANNOUNCEMENT_DAILY_LIMIT })}</span>
          )}
          <AnnouncementTestButton
            worldId={worldId}
            kind={kind}
            title={title}
            body={body}
            asWorld={signable && asWorld}
            disabled={!valid}
          />
          <AnnouncementPreviewButton {...previewProps} />
          <Button
            type="button"
            variant="outline"
            disabled={!canSchedule}
            onClick={() => setScheduleOpen(true)}
            data-testid="announcement-schedule"
          >
            <CalendarClock className="h-4 w-4" />
            {t("schedule")}
          </Button>
          <Button type="button" disabled={!canSend} onClick={() => setConfirmOpen(true)} data-testid="announcement-send">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("send")}
          </Button>
        </div>
      </SettingsSection>
      </div>

      <aside className="hidden @4xl/announcements:block" aria-label={t("previewLive")} data-testid="announcement-live-preview-aside">
        <div className="sticky top-0 space-y-3">
          <SectionLabel as="p" className="flex items-center gap-1.5">
            <Eye className="size-3.5" aria-hidden />
            {t("previewLive")}
          </SectionLabel>
          <AnnouncementLivePreview {...previewProps} testId="announcement-live-preview" />
        </div>
      </aside>
      </div>

      <div className="@container space-y-6">
      {/* ── Programmées (rien s'il n'y en a pas) ─────────── */}
      {scheduled.length > 0 && (
        <SettingsSection title={t("scheduledTitle")} help={t("scheduledHelp")} meta={String(scheduled.length)}>
          <ScheduledList items={scheduled} onChanged={() => void loadScheduled()} />
        </SettingsSection>
      )}

      {/* ── Historique ───────────────────────────────────── */}
      <SettingsSection
        title={t("history")}
        help={t("historyHelp")}
        meta={t("sentToday", { count: sentToday, limit: ANNOUNCEMENT_DAILY_LIMIT })}
      >
        {history === null ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground" data-testid="announcements-empty">
            <Megaphone className="h-5 w-5" />
            {t("historyEmpty")}
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {history.map((a) => (
              <HistoryRow key={a.id} announcement={a} roleById={roleById} reads={reads.get(a.id)} onOpen={() => setOpened(a)} />
            ))}
          </ul>
        )}
      </SettingsSection>
      </div>

      <AnnouncementDetails
        announcement={opened}
        roleById={roleById}
        reads={opened ? reads.get(opened.id) : undefined}
        onOpenChange={(open) => !open && setOpened(null)}
        onReuse={reuse}
        onRetracted={() => {
          setOpened(null);
          void loadHistory();
        }}
        onEdited={() => {
          // La fiche ouverte suit la version modifiée.
          void fetchWorldAnnouncements(supabase, worldId).then((list) => {
            setHistory(list);
            setOpened((o) => (o ? list.find((x) => x.id === o.id) ?? null : o));
          });
        }}
        onCloseAutoFocus={(e) => {
          if (!focusFormOnClose.current) return;
          focusFormOnClose.current = false;
          e.preventDefault();
          formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
          bodyRef.current?.focus({ preventScroll: true });
        }}
      />

      <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} recipients={recipients} onSchedule={schedule} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {kind === "message"
                ? t("confirmMessage", { count: recipients ?? 0 })
                : kind === "banner"
                  ? t("confirmBanner", { count: recipients ?? 0 })
                  : t("confirmNotification", { count: recipients ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void send()}>{t("send")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
