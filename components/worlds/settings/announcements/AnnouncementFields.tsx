"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bell, FlaskConical, Loader2, MessageSquare, PanelTop } from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { SectionLabel } from "@/components/ui/section-label";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { BannerCard } from "@/components/worlds/home/WorldAnnouncementBanners";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_KINDS,
  ANNOUNCEMENT_SCHEDULE_LIMIT,
  ANNOUNCEMENT_DAILY_LIMIT,
  ANNOUNCEMENT_TEST_HOURLY_LIMIT,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_VARIABLES,
  renderAnnouncement,
  sendAnnouncementTest,
  type AnnouncementErrorReason,
  type AnnouncementKind,
} from "@/lib/worldAnnouncements";
import { FIELD } from "../FeatureLayout";

/**
 * Les pièces communes à l'onglet « Annonces » et au message de bienvenue :
 * le choix du mode, l'éditeur du texte (variables, aperçu), l'essai à
 * soi-même et le libellé des refus de la base.
 */

/** Titre requis pour une notification ou un bandeau, texte requis partout. */
export function isAnnouncementValid(kind: AnnouncementKind, title: string, body: string): boolean {
  const titleOk = kind === "message" || (title.trim().length > 0 && title.trim().length <= ANNOUNCEMENT_TITLE_MAX);
  return titleOk && body.trim().length > 0 && body.length <= ANNOUNCEMENT_BODY_MAX;
}

/** Le message d'un refus de la base. */
export function useAnnouncementErrorMessage() {
  const t = useTranslations("worlds.announcements");
  const tCommon = useTranslations("common");
  return React.useCallback(
    (reason: AnnouncementErrorReason) =>
      reason === "rate_limit"
        ? t("errorRateLimit", { count: ANNOUNCEMENT_DAILY_LIMIT })
        : reason === "test_rate_limit"
          ? t("errorTestRateLimit", { count: ANNOUNCEMENT_TEST_HOURLY_LIMIT })
          : reason === "schedule_limit"
            ? t("errorScheduleLimit", { count: ANNOUNCEMENT_SCHEDULE_LIMIT })
            : reason === "no_recipients"
              ? t("errorNoRecipients")
              : reason === "forbidden"
                ? tCommon("forbidden")
                : reason === "dms_disabled"
                  ? t("errorDmsDisabled")
                  : t("errorSend"),
    [t, tCommon],
  );
}

/**
 * S'essayer l'annonce : une notification arrive dans les siennes, un bandeau
 * s'affiche en tête de l'accueil du monde (migration 233).
 */
function useAnnouncementTest(worldId: string) {
  const t = useTranslations("worlds.announcements");
  const errorMessage = useAnnouncementErrorMessage();
  const supabase = React.useMemo(() => createClient(), []);
  const [testing, setTesting] = React.useState(false);
  const sendTest = React.useCallback(
    async (kind: AnnouncementKind, title: string, body: string, asWorld = false, welcome?: { wikiPageId: string | null }) => {
      setTesting(true);
      const res = await sendAnnouncementTest(supabase, {
        worldId, kind, title, body, asWorld,
        ...(welcome && { welcome: true, wikiPageId: welcome.wikiPageId }),
      });
      setTesting(false);
      if (!res.ok) {
        toast.error(errorMessage(res.reason));
        return;
      }
      toast.success(kind === "banner" ? t("testSentBanner") : t("testSent"));
    },
    [supabase, worldId, errorMessage, t],
  );
  return { testing, sendTest };
}

/**
 * Le bouton d'essai, selon le type : notification ou bandeau. Un message
 * privé ne peut pas s'adresser à son auteur : pas d'essai, l'aperçu suffit.
 */
export function AnnouncementTestButton({
  worldId,
  kind,
  title,
  body,
  asWorld,
  disabled,
  welcome,
  testId = "announcement-test",
}: {
  worldId: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  asWorld: boolean;
  disabled: boolean;
  /** Essai du message de bienvenue, et sa page du wiki liée. */
  welcome?: { wikiPageId: string | null };
  testId?: string;
}) {
  const t = useTranslations("worlds.announcements");
  const { testing, sendTest } = useAnnouncementTest(worldId);
  if (kind === "message") return null;
  const banner = kind === "banner";
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || testing}
      onClick={() => void sendTest(kind, title, body, asWorld, welcome)}
      title={banner ? t("sendTestBannerHelp") : t("sendTestHelp")}
      data-testid={testId}
    >
      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
      {banner ? t("sendTestBanner") : t("sendTest")}
    </Button>
  );
}

/** Message privé, notification ou bandeau, en cartes-radios. */
export function KindPicker({
  kind,
  onChange,
  dmsEnabled,
  kinds = ANNOUNCEMENT_KINDS,
  testIdPrefix = "announcement",
}: {
  kind: AnnouncementKind;
  onChange: (kind: AnnouncementKind) => void;
  dmsEnabled: boolean;
  /** Les modes proposés (la bienvenue n'a pas de bandeau). */
  kinds?: readonly AnnouncementKind[];
  testIdPrefix?: string;
}) {
  const t = useTranslations("worlds.announcements");
  const shown = kinds.filter((k) => k !== "message" || dmsEnabled).length;
  return (
    <div
      className={cn("grid gap-3 @md:grid-cols-2", shown > 2 && "@2xl:grid-cols-3")}
      role="radiogroup"
      aria-label={t("kind")}
    >
      {dmsEnabled && kinds.includes("message") && (
        <KindCard
          active={kind === "message"}
          testId={`${testIdPrefix}-kind-message`}
          onClick={() => onChange("message")}
          icon={<MessageSquare className="size-4" aria-hidden />}
          title={t("kindMessage")}
          help={t("kindMessageHelp")}
        />
      )}
      <KindCard
        active={kind === "notification"}
        testId={`${testIdPrefix}-kind-notification`}
        onClick={() => onChange("notification")}
        icon={<Bell className="size-4" aria-hidden />}
        title={t("kindNotification")}
        help={t("kindNotificationHelp")}
      />
      {kinds.includes("banner") && (
        <KindCard
          active={kind === "banner"}
          testId={`${testIdPrefix}-kind-banner`}
          onClick={() => onChange("banner")}
          icon={<PanelTop className="size-4" aria-hidden />}
          title={t("kindBanner")}
          help={t("kindBannerHelp")}
        />
      )}
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
      className={cn("flex items-start gap-3 p-3", active && "border-foreground")}
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

/**
 * Les variables, puis le texte ou son aperçu (avec les valeurs de l'auteur).
 */
export function BodyEditor({
  kind,
  title,
  body,
  onBodyChange,
  preview,
  sample,
  worldName,
  asWorld = false,
  bodyRef,
  testIdPrefix = "announcement",
}: {
  kind: AnnouncementKind;
  title: string;
  body: string;
  onBodyChange: (body: string) => void;
  preview: boolean;
  sample: { username: string; world: string };
  worldName: string;
  /** Signée par le monde (notification, bandeau). */
  asWorld?: boolean;
  bodyRef?: React.RefObject<HTMLTextAreaElement | null>;
  testIdPrefix?: string;
}) {
  const t = useTranslations("worlds.announcements");
  const ownRef = React.useRef<HTMLTextAreaElement>(null);
  const ref = bodyRef ?? ownRef;

  /** Insère une variable à l'emplacement du curseur. */
  function insertVariable(name: string) {
    const token = `{${name}}`;
    const el = ref.current;
    if (!el) {
      onBodyChange(body + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    onBodyChange(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SectionLabel as="span">{t("variables")}</SectionLabel>
        {ANNOUNCEMENT_VARIABLES.map((v) => (
          <Button
            key={v}
            type="button"
            variant="outline"
            size="xs"
            disabled={preview}
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
          signer={asWorld ? worldName : sample.username}
          testId={`${testIdPrefix}-preview`}
        />
      ) : (
        <Textarea
          ref={ref}
          value={body}
          maxLength={ANNOUNCEMENT_BODY_MAX}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder={t("bodyPlaceholder")}
          aria-label={t("body")}
          data-testid={`${testIdPrefix}-text`}
          rows={8}
          className={cn(FIELD, "min-h-40")}
        />
      )}
    </>
  );
}

/** Ce que verra un destinataire. */
export function AnnouncementPreview({
  kind,
  title,
  body,
  worldName,
  signer,
  testId = "announcement-preview",
}: {
  kind: AnnouncementKind;
  title: string;
  body: string;
  worldName: string;
  /** Le nom affiché comme expéditeur : le monde ou l'auteur. */
  signer?: string;
  testId?: string;
}) {
  const t = useTranslations("worlds.announcements");
  if (kind === "banner") {
    return (
      <div className="rounded-lg border border-border bg-background p-4" data-testid={testId}>
        <BannerCard title={title || t("previewEmpty")} body={body} signer={signer ?? null} testId={`${testId}-banner`} />
      </div>
    );
  }
  if (kind === "message") {
    return (
      <div className="rounded-lg border border-border bg-background p-4" data-testid={testId}>
        <p className="w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-sm">
          {body || t("previewEmpty")}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4" data-testid={testId}>
      <SectionLabel as="div">{worldName}</SectionLabel>
      <p className="font-semibold">{title || t("previewEmpty")}</p>
      {body ? <MarkdownRenderer content={body} /> : null}
      {signer ? <p className="text-xs-plus text-muted-foreground">{t("signedBy", { name: signer })}</p> : null}
    </div>
  );
}
