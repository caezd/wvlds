"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { browserTimezone, supportedTimezones } from "@/lib/relativeTime";
import type { WorldMemberCardFields } from "@/lib/worldMembers";
import type { WorldMemberStatus } from "@/types/db";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";
const STATUSES: WorldMemberStatus[] = ["active", "paused", "away"];

/** Bornes de l'interface, sous celles de la base (migration 177). */
export const CARD_LIMITS = { bio: 500, availability: 120, statusNote: 120 } as const;

/**
 * « Ma carte dans ce monde » pour le membre lui-même ; en mode `status`, la
 * seule section statut, pour un gestionnaire qui met un autre membre en pause.
 *
 * Une seule écriture sur `world_members` à l'enregistrement ; le déclencheur
 * `tg_world_members_guard` refuse à un gestionnaire tout ce qui n'est pas le
 * statut, l'UI ne lui montre donc rien d'autre.
 */
export function WorldMemberCardDialog({
  worldId,
  userId,
  mode,
  initial,
  onSaved,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  worldId: string;
  /** Le membre concerné (soi-même en mode `self`). */
  userId: string;
  mode: "self" | "status";
  initial: WorldMemberCardFields;
  onSaved: (fields: WorldMemberCardFields) => void;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("worlds.members.card");
  const tStatus = useTranslations("worlds.members.status");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const [bio, setBio] = useState(initial.bio ?? "");
  const [availability, setAvailability] = useState(initial.availability ?? "");
  const [timezone, setTimezone] = useState(initial.timezone ?? NONE);
  const [birthdayMonth, setBirthdayMonth] = useState<string>(initial.birthday_month ? String(initial.birthday_month) : NONE);
  const [birthdayDay, setBirthdayDay] = useState<string>(initial.birthday_day ? String(initial.birthday_day) : NONE);
  const [status, setStatus] = useState<WorldMemberStatus>(initial.status);
  const [statusUntil, setStatusUntil] = useState(initial.status_until ?? "");
  const [statusNote, setStatusNote] = useState(initial.status_note ?? "");
  const [saving, setSaving] = useState(false);

  // Repartir de la carte enregistrée à chaque ouverture.
  useEffect(() => {
    if (!open) return;
    setBio(initial.bio ?? "");
    setAvailability(initial.availability ?? "");
    setTimezone(initial.timezone ?? NONE);
    setBirthdayMonth(initial.birthday_month ? String(initial.birthday_month) : NONE);
    setBirthdayDay(initial.birthday_day ? String(initial.birthday_day) : NONE);
    setStatus(initial.status);
    setStatusUntil(initial.status_until ?? "");
    setStatusNote(initial.status_note ?? "");
  }, [open, initial]);

  const timezones = useMemo(supportedTimezones, []);
  const months = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: fmt.format(new Date(Date.UTC(2001, i, 1))) }));
  }, [locale]);

  const birthdayComplete = birthdayMonth !== NONE && birthdayDay !== NONE;
  const birthdayPartial = (birthdayMonth !== NONE) !== (birthdayDay !== NONE);

  async function save() {
    if (birthdayPartial) return;
    setSaving(true);
    const statusFields = {
      status,
      status_until: status === "active" || !statusUntil ? null : statusUntil,
      status_note: status === "active" || !statusNote.trim() ? null : statusNote.trim(),
    };
    const cardFields =
      mode === "self"
        ? {
            bio: bio.trim() || null,
            availability: availability.trim() || null,
            timezone: timezone === NONE ? null : timezone,
            birthday_month: birthdayComplete ? Number(birthdayMonth) : null,
            birthday_day: birthdayComplete ? Number(birthdayDay) : null,
          }
        : {};
    const patch = { ...statusFields, ...cardFields };
    const { error } = await supabase
      .from(TABLE.WORLD_MEMBERS)
      .update(patch)
      .eq("world_id", worldId)
      .eq("user_id", userId);
    setSaving(false);
    if (error) {
      toast.error(t("saveFailed"), { description: error.message });
      return;
    }
    onSaved({ ...initial, ...patch });
    toast.success(tCommon("changesSaved"));
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "self" ? t("title") : t("statusTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Statut ─────────────────────────────────────── */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{tStatus("label")}</legend>
            <RadioGroup value={status} onValueChange={(v) => setStatus(v as WorldMemberStatus)} className="grid gap-2 sm:grid-cols-3">
              {STATUSES.map((s) => (
                <label
                  key={s}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-border-soft px-3 py-2 text-sm has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent/10"
                >
                  <RadioGroupItem value={s} id={`status-${s}`} className="mt-0.5" />
                  <span>
                    <span className="block">{tStatus(s)}</span>
                    <span className="block text-xs text-muted-foreground">{tStatus(`${s}Help`)}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {status !== "active" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="status-until">{tStatus("until")}</Label>
                  <Input id="status-until" type="date" value={statusUntil} onChange={(e) => setStatusUntil(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="status-note">{tStatus("note")}</Label>
                  <Input
                    id="status-note"
                    value={statusNote}
                    maxLength={CARD_LIMITS.statusNote}
                    placeholder={tStatus("notePlaceholder")}
                    onChange={(e) => setStatusNote(e.target.value)}
                  />
                </div>
              </div>
            )}
          </fieldset>

          {mode === "self" && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="card-bio">{t("bio")}</Label>
                <Textarea
                  id="card-bio"
                  value={bio}
                  maxLength={CARD_LIMITS.bio}
                  rows={3}
                  placeholder={t("bioPlaceholder")}
                  onChange={(e) => setBio(e.target.value)}
                />
                <p className="text-right text-xs text-muted-foreground">
                  {bio.length}/{CARD_LIMITS.bio}
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="card-availability">{t("availability")}</Label>
                <Input
                  id="card-availability"
                  value={availability}
                  maxLength={CARD_LIMITS.availability}
                  placeholder={t("availabilityPlaceholder")}
                  onChange={(e) => setAvailability(e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label>{t("timezone")}</Label>
                <div className="flex gap-2">
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger aria-label={t("timezone")} className="min-w-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={NONE}>{t("timezoneNone")}</SelectItem>
                      {timezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {browserTimezone() && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setTimezone(browserTimezone() ?? NONE)}>
                      {t("timezoneUseMine")}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t("timezoneHelp")}</p>
              </div>

              <div className="grid gap-1.5">
                <Label>{t("birthday")}</Label>
                <div className="flex flex-wrap gap-2">
                  <Select value={birthdayDay} onValueChange={setBirthdayDay}>
                    <SelectTrigger aria-label={t("birthdayDay")} className="w-24">
                      <SelectValue placeholder={t("birthdayDay")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={NONE}>—</SelectItem>
                      {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={birthdayMonth} onValueChange={setBirthdayMonth}>
                    <SelectTrigger aria-label={t("birthdayMonth")} className="min-w-40 flex-1">
                      <SelectValue placeholder={t("birthdayMonth")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={NONE}>—</SelectItem>
                      {months.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className={birthdayPartial ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                  {birthdayPartial ? t("birthdayIncomplete") : t("birthdayHelp")}
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={saving || birthdayPartial}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
