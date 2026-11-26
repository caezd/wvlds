"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Bell, CalendarClock, Loader2, MessageSquare, PanelTop, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { createClient } from "@/lib/supabase/client";
import {
  ANNOUNCEMENT_SCHEDULE_MAX_DAYS,
  announcementErrorReason,
  cancelScheduledAnnouncement,
  type AnnouncementKind,
  type ScheduledAnnouncement,
} from "@/lib/worldAnnouncements";
import { FIELD } from "../FeatureLayout";
import { useAnnouncementErrorMessage } from "./AnnouncementFields";

/**
 * Envois programmés (migration 230) : la base les part chaque minute (pg_cron)
 * au nom de leur auteur, en revérifiant ses droits et le plafond du jour.
 */

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Une date au format d'un champ `datetime-local`, à l'heure locale. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Dans une heure, arrondi au quart d'heure suivant. */
function defaultSchedule(now = new Date()): Date {
  const d = new Date(now.getTime() + 60 * MINUTE_MS);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  return d;
}

/** Valide : dans le futur (une minute de marge), à 90 jours au plus. */
export function isScheduleValid(value: Date | null, now = Date.now()): value is Date {
  if (!value || Number.isNaN(value.getTime())) return false;
  const t = value.getTime();
  return t > now + MINUTE_MS && t <= now + ANNOUNCEMENT_SCHEDULE_MAX_DAYS * DAY_MS;
}

function useDateTimeFormat() {
  const locale = useLocale();
  return React.useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
}

export function ScheduleDialog({
  open,
  onOpenChange,
  recipients,
  onSchedule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: number | null;
  /** Rend `true` si la programmation a réussi (le dialogue se ferme alors). */
  onSchedule: (when: Date) => Promise<boolean>;
}) {
  const t = useTranslations("worlds.announcements");
  const tCommon = useTranslations("common");
  const fmt = useDateTimeFormat();
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(toLocalInputValue(defaultSchedule()));
  }

  // `new Date("AAAA-MM-JJTHH:mm")` se lit à l'heure locale.
  const when = value ? new Date(value) : null;
  const valid = isScheduleValid(when);
  const now = new Date();

  async function submit() {
    if (!isScheduleValid(when)) return;
    setSaving(true);
    const ok = await onSchedule(when);
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="announcement-schedule-dialog">
        <DialogHeader>
          <DialogTitle>{t("scheduleTitle")}</DialogTitle>
          <DialogDescription>{t("scheduleDescription", { count: recipients ?? 0 })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <SectionLabel as="div">{t("scheduleAt")}</SectionLabel>
          <Input
            type="datetime-local"
            aria-label={t("scheduleAt")}
            value={value}
            min={toLocalInputValue(new Date(now.getTime() + 2 * MINUTE_MS))}
            max={toLocalInputValue(new Date(now.getTime() + ANNOUNCEMENT_SCHEDULE_MAX_DAYS * DAY_MS))}
            onChange={(e) => setValue(e.target.value)}
            data-testid="announcement-schedule-at"
            aria-invalid={!!value && !valid}
            className={FIELD}
          />
          <p className="text-xs-plus text-muted-foreground" data-testid="announcement-schedule-summary">
            {valid ? t("scheduleSummary", { date: fmt.format(when) }) : t("scheduleInvalid", { days: ANNOUNCEMENT_SCHEDULE_MAX_DAYS })}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" disabled={!valid || saving} onClick={() => void submit()} data-testid="announcement-schedule-confirm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            {t("schedule")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KindIcon({ kind }: { kind: AnnouncementKind }) {
  const t = useTranslations("worlds.announcements");
  const cls = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
  if (kind === "message") return <MessageSquare className={cls} aria-label={t("kindMessage")} />;
  if (kind === "banner") return <PanelTop className={cls} aria-label={t("kindBanner")} />;
  return <Bell className={cls} aria-label={t("kindNotification")} />;
}

/** Les envois en attente, et ceux qui ont échoué (avec leur raison). */
export function ScheduledList({
  items,
  onChanged,
}: {
  items: ScheduledAnnouncement[];
  onChanged: () => void;
}) {
  const t = useTranslations("worlds.announcements");
  const tCommon = useTranslations("common");
  const fmt = useDateTimeFormat();
  const errorMessage = useAnnouncementErrorMessage();
  const supabase = React.useMemo(() => createClient(), []);
  const [cancelling, setCancelling] = React.useState<string | null>(null);

  async function cancel(id: string) {
    setCancelling(id);
    const res = await cancelScheduledAnnouncement(supabase, id);
    setCancelling(null);
    if (!res.ok) {
      toast.error(errorMessage(res.reason));
      return;
    }
    toast.success(t("scheduleCancelled"));
    onChanged();
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((s) => (
        <li key={s.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0" data-testid="scheduled-row" data-status={s.status}>
          <div className="min-w-0 flex-1 space-y-1">
            <span className="flex items-center gap-2 text-sm">
              <KindIcon kind={s.kind} />
              <span className="min-w-0 flex-1 truncate font-medium">{s.title ?? s.body}</span>
              {s.status === "failed" ? (
                <Badge className="text-destructive">
                  <AlertTriangle className="size-3" aria-hidden />
                  {t("scheduleFailed")}
                </Badge>
              ) : null}
            </span>
            <span className="block text-xs-plus text-muted-foreground">
              {t("scheduledFor", { date: fmt.format(new Date(s.scheduled_for)) })}
              {" · "}
              {t("by", { name: s.author?.username ?? t("unknownAuthor") })}
            </span>
            {s.status === "failed" && s.error ? (
              <span className="block text-xs-plus text-destructive" data-testid="scheduled-error">
                {errorMessage(announcementErrorReason({ message: s.error }))}
              </span>
            ) : null}
          </div>
          {s.status === "pending" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void cancel(s.id)}
              disabled={cancelling === s.id}
              data-testid="scheduled-cancel"
            >
              {cancelling === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              {tCommon("cancel")}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
