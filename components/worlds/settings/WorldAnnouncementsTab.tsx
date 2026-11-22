"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bell, CopyPlus, FlaskConical, Loader2, Megaphone, MessageSquare, Send, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { Badge } from "@/components/ui/badge";
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
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_DAILY_LIMIT,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_VARIABLES,
  ANNOUNCEMENT_TEST_HOURLY_LIMIT,
  countAnnouncementRecipients,
  fetchAnnouncementReadCounts,
  fetchWorldAnnouncements,
  renderAnnouncement,
  sendAnnouncementTest,
  sendWorldAnnouncement,
  type AnnouncementKind,
  type WorldAnnouncement,
} from "@/lib/worldAnnouncements";
import { FIELD, SettingsSection } from "./FeatureLayout";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Onglet « Annonces » : écrire à tous les membres du monde, ou aux porteurs de
 * certains rôles, par message privé ou par notification (migration 227).
 * Réservé à `members.announce` ; la base fait foi (permission, plafond
 * journalier, blocages). L'auteur peut s'envoyer un essai, et l'historique
 * montre les lectures et permet de reprendre une annonce (migration 228).
 */
export function WorldAnnouncementsTab({ worldId, worldName }: { worldId: string; worldName: string }) {
  const t = useTranslations("worlds.announcements");
  const tCommon = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);
  const { direct_messages: dmsEnabled } = useFeatureFlags();
  const { roles } = useWorldMembership();
  const { username } = useCurrentUser();

  const [kind, setKind] = React.useState<AnnouncementKind>(dmsEnabled ? "message" : "notification");
  const [roleIds, setRoleIds] = React.useState<string[]>([]);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [preview, setPreview] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [recipients, setRecipients] = React.useState<number | null>(null);
  const [history, setHistory] = React.useState<WorldAnnouncement[] | null>(null);
  const [reads, setReads] = React.useState<Map<string, number>>(() => new Map());
  const [testing, setTesting] = React.useState(false);
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

  // Le compte suit le type (les blocages ne comptent que pour un message
  // privé) et les rôles visés.
  const roleKey = roleIds.join(",");
  React.useEffect(() => {
    let cancelled = false;
    setRecipients(null);
    void countAnnouncementRecipients(supabase, worldId, kind, roleKey ? roleKey.split(",") : []).then((n) => {
      if (!cancelled) setRecipients(n);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId, kind, roleKey]);

  const sentToday = (history ?? []).filter((a) => Date.now() - new Date(a.created_at).getTime() < DAY_MS).length;
  const limitReached = sentToday >= ANNOUNCEMENT_DAILY_LIMIT;
  const titleOk = kind === "message" || (title.trim().length > 0 && title.trim().length <= ANNOUNCEMENT_TITLE_MAX);
  const bodyOk = body.trim().length > 0 && body.length <= ANNOUNCEMENT_BODY_MAX;
  const canSend = titleOk && bodyOk && !sending && !limitReached && (recipients ?? 0) > 0;
  const canTest = titleOk && bodyOk && !testing;

  const roleById = React.useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const sample = { username: username ?? t("sampleUsername"), world: worldName };

  function toggleRole(id: string) {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  /** Insère une variable à l'emplacement du curseur. */
  function insertVariable(name: string) {
    const token = `{${name}}`;
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function sendTest() {
    setTesting(true);
    const res = await sendAnnouncementTest(supabase, { worldId, kind, title, body });
    setTesting(false);
    if (!res.ok) {
      toast.error(
        res.reason === "test_rate_limit"
          ? t("errorTestRateLimit", { count: ANNOUNCEMENT_TEST_HOURLY_LIMIT })
          : res.reason === "forbidden"
            ? tCommon("forbidden")
            : t("errorSend"),
      );
      return;
    }
    toast.success(kind === "message" ? t("testSentMessage") : t("testSent"));
  }

  /** Reprend une annonce de l'historique dans le formulaire. */
  function reuse(a: WorldAnnouncement) {
    setKind(a.kind === "message" && !dmsEnabled ? "notification" : a.kind);
    setTitle(a.title ?? "");
    setBody(a.body);
    // Un rôle supprimé depuis ne se rattrape pas ; sans rôle restant, tous.
    setRoleIds(a.role_ids.filter((id) => roleById.has(id)));
    setPreview(false);
    focusFormOnClose.current = true;
    setOpened(null);
    toast.success(t("reused"));
  }

  async function send() {
    setConfirmOpen(false);
    setSending(true);
    const res = await sendWorldAnnouncement(supabase, { worldId, kind, title, body, roleIds });
    setSending(false);
    if (!res.ok) {
      toast.error(
        res.reason === "rate_limit"
          ? t("errorRateLimit", { count: ANNOUNCEMENT_DAILY_LIMIT })
          : res.reason === "forbidden"
            ? tCommon("forbidden")
            : res.reason === "dms_disabled"
              ? t("errorDmsDisabled")
              : t("errorSend"),
      );
      return;
    }
    if (res.recipients === 0) {
      toast.error(t("errorNoRecipients"));
      return;
    }
    toast.success(t("sent", { count: res.recipients }));
    setTitle("");
    setBody("");
    setPreview(false);
    void loadHistory();
  }

  return (
    <div className="@container mx-auto max-w-3xl space-y-6" data-testid="announcements-tab">
      <div ref={formRef} className="scroll-mt-6" />
      {/* ── Type ─────────────────────────────────────────── */}
      <SettingsSection title={t("kind")} help={t("kindHelp")} className="border-t-0 pt-0">
        <div className="grid gap-3 @md:grid-cols-2" role="radiogroup" aria-label={t("kind")}>
          {dmsEnabled && (
            <KindCard
              active={kind === "message"}
              testId="announcement-kind-message"
              onClick={() => setKind("message")}
              icon={<MessageSquare className="size-4" aria-hidden />}
              title={t("kindMessage")}
              help={t("kindMessageHelp")}
            />
          )}
          <KindCard
            active={kind === "notification"}
            testId="announcement-kind-notification"
            onClick={() => setKind("notification")}
            icon={<Bell className="size-4" aria-hidden />}
            title={t("kindNotification")}
            help={t("kindNotificationHelp")}
          />
        </div>
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
        </div>
      </SettingsSection>

      {/* ── Titre (notification seulement) ───────────────── */}
      {kind === "notification" && (
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

      {/* ── Message ──────────────────────────────────────── */}
      <SettingsSection
        title={t("body")}
        help={kind === "notification" ? t("bodyHelpNotification") : t("bodyHelpMessage")}
        meta={`${body.length} / ${ANNOUNCEMENT_BODY_MAX}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <SectionLabel as="span">{t("variables")}</SectionLabel>
          {ANNOUNCEMENT_VARIABLES.map((v) => (
            <Button
              key={v}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => insertVariable(v)}
              title={t(`variable_${v}`, { value: sample[v] })}
            >
              <code className="font-mono">{`{${v}}`}</code>
            </Button>
          ))}
        </div>
        {preview ? (
          <AnnouncementPreview
            kind={kind}
            title={renderAnnouncement(title, sample)}
            body={renderAnnouncement(body, sample)}
            worldName={worldName}
          />
        ) : (
          <Textarea
            ref={bodyRef}
            value={body}
            maxLength={ANNOUNCEMENT_BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("bodyPlaceholder")}
            aria-label={t("body")}
            data-testid="announcement-text"
            rows={8}
            className={cn(FIELD, "min-h-40")}
          />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {limitReached && (
            <span className="mr-auto text-sm text-muted-foreground">{t("errorRateLimit", { count: ANNOUNCEMENT_DAILY_LIMIT })}</span>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={!canTest}
            onClick={() => void sendTest()}
            title={kind === "message" ? t("sendTestMessageHelp") : t("sendTestHelp")}
            data-testid="announcement-test"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            {t("sendTest")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setPreview((p) => !p)} aria-pressed={preview} data-testid="announcement-preview-toggle">
            {preview ? tCommon("edit") : tCommon("preview")}
          </Button>
          <Button type="button" disabled={!canSend} onClick={() => setConfirmOpen(true)}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("send")}
          </Button>
        </div>
      </SettingsSection>

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

      <AnnouncementDetails
        announcement={opened}
        roleById={roleById}
        reads={opened ? reads.get(opened.id) : undefined}
        onOpenChange={(open) => !open && setOpened(null)}
        onReuse={reuse}
        onCloseAutoFocus={(e) => {
          if (!focusFormOnClose.current) return;
          focusFormOnClose.current = false;
          e.preventDefault();
          formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
          bodyRef.current?.focus({ preventScroll: true });
        }}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {kind === "message"
                ? t("confirmMessage", { count: recipients ?? 0 })
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

function KindCard({
  active,
  testId,
  onClick,
  icon,
  title,
  help,
}: {
  active: boolean;
  testId: string;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  help: string;
}) {
  return (
    <InteractiveCard
      role="radio"
      aria-checked={active}
      data-testid={testId}
      onClick={onClick}
      className={cn("flex items-start gap-3 p-3", active && "border-foreground bg-background")}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full",
          active ? "bg-muted text-foreground" : "bg-background text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 space-y-0.5">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs leading-snug text-muted-foreground">{help}</span>
      </span>
    </InteractiveCard>
  );
}

/** Ce que verra un destinataire, avec les variables de l'auteur. */
function AnnouncementPreview({
  kind,
  title,
  body,
  worldName,
}: {
  kind: AnnouncementKind;
  title: string;
  body: string;
  worldName: string;
}) {
  const t = useTranslations("worlds.announcements");
  if (kind === "message") {
    return (
      <div className="rounded-md border border-border bg-background p-4" data-testid="announcement-preview">
        <p className="w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-sm">
          {body || t("previewEmpty")}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-4" data-testid="announcement-preview">
      <SectionLabel as="div">{worldName}</SectionLabel>
      <p className="font-semibold">{title || t("previewEmpty")}</p>
      {body ? <MarkdownRenderer content={body} /> : null}
    </div>
  );
}

type RoleLike = { id: string; name: string; color: string; lucide_icon: string | null };

/** « 3 lectures sur 12 », ou le seul nombre de destinataires sans suivi. */
function ReadBadge({ announcement: a, reads }: { announcement: WorldAnnouncement; reads: number | undefined }) {
  const t = useTranslations("worlds.announcements");
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
    </>
  );
}

function HistoryRow({
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
  const t = useTranslations("worlds.announcements");
  return (
    <li data-testid="announcement-row">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full space-y-1.5 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      >
        <span className="flex items-center gap-2 text-sm">
          {a.kind === "message" ? (
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t("kindMessage")} />
          ) : (
            <Bell className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t("kindNotification")} />
          )}
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

/** Une annonce envoyée, en entier, avec de quoi la reprendre. */
function AnnouncementDetails({
  announcement: a,
  roleById,
  reads,
  onOpenChange,
  onReuse,
  onCloseAutoFocus,
}: {
  announcement: WorldAnnouncement | null;
  roleById: Map<string, RoleLike>;
  reads: number | undefined;
  onOpenChange: (open: boolean) => void;
  onReuse: (a: WorldAnnouncement) => void;
  onCloseAutoFocus: (e: Event) => void;
}) {
  const t = useTranslations("worlds.announcements");
  // Garde le contenu affiché le temps de l'animation de fermeture.
  const [shown, setShown] = React.useState(a);
  if (a && a !== shown) setShown(a);
  const current = a ?? shown;
  return (
    <Dialog open={!!a} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="announcement-details" onCloseAutoFocus={onCloseAutoFocus}>
        {current && (
          <>
            <DialogHeader>
              <SectionLabel as="div" className="flex items-center gap-1.5">
                {current.kind === "message" ? (
                  <MessageSquare className="size-3.5" aria-hidden />
                ) : (
                  <Bell className="size-3.5" aria-hidden />
                )}
                {current.kind === "message" ? t("kindMessage") : t("kindNotification")}
              </SectionLabel>
              <DialogTitle>{current.title ?? t("kindMessage")}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <AnnouncementMeta announcement={current} roleById={roleById} />
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border bg-background p-4">
              {current.kind === "notification" ? (
                <MarkdownRenderer content={current.body} />
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm">{current.body}</p>
              )}
            </div>
            <DialogFooter className="items-center sm:justify-between">
              <ReadBadge announcement={current} reads={reads} />
              <Button type="button" onClick={() => onReuse(current)} data-testid="announcement-reuse">
                <CopyPlus className="h-4 w-4" />
                {t("reuse")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
