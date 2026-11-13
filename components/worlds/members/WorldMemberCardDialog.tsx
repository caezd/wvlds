"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { browserTimezone, localTimeIn, supportedTimezones } from "@/lib/relativeTime";
import type { WorldMemberCardFields } from "@/lib/worldMembers";
import { CARD_NONE, birthdayPartial, buildCardPatch, cardDraftFrom, type CardDraft } from "@/lib/worldMemberCard";
import type { WorldMemberStatus } from "@/types/db";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimezoneSelect } from "./TimezoneSelect";

const NONE = CARD_NONE;
const STATUSES: WorldMemberStatus[] = ["active", "paused", "away"];
const STATUS_DOT: Record<WorldMemberStatus, string> = { active: "bg-success", paused: "bg-warning", away: "bg-destructive" };

/** Bornes de l'interface, sous celles de la base (migration 177). */
export const CARD_LIMITS = { bio: 500, availability: 120, statusNote: 120 } as const;

/** Un libellé, avec à droite de sa ligne un compteur ou une action. */
function FieldLabel({ htmlFor, children, aside }: { htmlFor?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={htmlFor} className="flex-1">{children}</Label>
      {aside}
    </div>
  );
}

function Counter({ value, max }: { value: number; max: number }) {
  return <span className="text-xs-plus tabular-nums text-muted-foreground">{value} / {max}</span>;
}

/**
 * Le formulaire de la carte : statut (et, pour soi, présentation,
 * disponibilités, fuseau, anniversaire). Deux usages :
 *
 * - **non contrôlé** (sans `value`) : le dialogue d'un gestionnaire qui règle
 *   le statut d'un autre membre ; le formulaire enregistre lui-même, une seule
 *   écriture sur `world_members` (le déclencheur `tg_world_members_guard`
 *   refuse à un gestionnaire tout ce qui n'est pas le statut) ;
 * - **contrôlé** (`value` + `onChange`) : l'onglet « Ma carte » de « Mon
 *   profil », dont la barre d'enregistrement écrit tout d'un coup ; le
 *   formulaire n'enregistre rien et n'a pas de boutons.
 */
export function WorldMemberCardForm({
  worldId,
  userId,
  mode,
  initial,
  onSaved,
  onCancel,
  resetKey,
  value,
  onChange,
}: {
  worldId: string;
  userId: string;
  mode: "self" | "status";
  initial: WorldMemberCardFields;
  onSaved?: (fields: WorldMemberCardFields) => void;
  onCancel?: () => void;
  /** Remet le formulaire à la carte enregistrée quand il passe à vrai (ouverture d'un dialogue). */
  resetKey?: unknown;
  /** Mode contrôlé : le brouillon vient du parent. */
  value?: CardDraft;
  onChange?: (patch: Partial<CardDraft>) => void;
}) {
  const t = useTranslations("worlds.members.card");
  const tStatus = useTranslations("worlds.members.status");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);

  const controlled = value !== undefined && onChange !== undefined;
  const [local, setLocal] = useState<CardDraft>(() => cardDraftFrom(initial));
  const [saving, setSaving] = useState(false);

  // Repartir de la carte enregistrée quand elle change ou qu'on rouvre.
  useEffect(() => {
    if (!controlled) setLocal(cardDraftFrom(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, resetKey]);

  const draft = controlled ? value : local;
  // Un `set` stable : le choix du fuseau est mémoïsé (quatre cents options), il
  // ne doit pas se re-rendre à chaque lettre tapée ailleurs.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  const set = useCallback((patch: Partial<CardDraft>) => {
    if (onChangeRef.current && controlled) onChangeRef.current(patch);
    else setLocal((d) => ({ ...d, ...patch }));
  }, [controlled]);
  const setTimezone = useCallback((timezone: string) => set({ timezone }), [set]);

  const timezones = useMemo(supportedTimezones, []);
  const months = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: fmt.format(new Date(Date.UTC(2001, i, 1))) }));
  }, [locale]);

  const partial = birthdayPartial(draft);
  const myTimezone = browserTimezone();
  const timeThere = draft.timezone !== NONE ? localTimeIn(draft.timezone, locale) : null;

  async function save() {
    if (partial) return;
    setSaving(true);
    const patch = buildCardPatch(draft, mode);
    const { error } = await supabase.from(TABLE.WORLD_MEMBERS).update(patch).eq("world_id", worldId).eq("user_id", userId);
    setSaving(false);
    if (error) {
      toast.error(t("saveFailed"), { description: error.message });
      return;
    }
    onSaved?.({ ...initial, ...patch });
    toast.success(tCommon("changesSaved"));
  }

  return (
    <div className="flex flex-col gap-6" data-testid="member-card-form">
      {/* ── Statut : un sélecteur segmenté, l'aide de l'option choisie dessous ── */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{tStatus("label")}</legend>
        <RadioGroupPrimitive.Root
          value={draft.status}
          onValueChange={(v) => set({ status: v as WorldMemberStatus })}
          className="grid grid-cols-3 gap-0.5 rounded-lg border border-input p-0.5"
        >
          {STATUSES.map((s) => (
            <RadioGroupPrimitive.Item
              key={s}
              value={s}
              className="flex h-[30px] items-center justify-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-muted data-[state=checked]:text-foreground"
            >
              <span aria-hidden className={cn("h-[7px] w-[7px] rounded-full", STATUS_DOT[s])} />
              {tStatus(s)}
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
        <p className="text-xs text-muted-foreground">{tStatus(`${draft.status}Help`)}</p>
        {draft.status !== "active" && (
          <div className="grid gap-3 pt-1 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="status-until">{tStatus("until")}</Label>
              <Input id="status-until" type="date" value={draft.statusUntil} onChange={(e) => set({ statusUntil: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="status-note">{tStatus("note")}</Label>
              <Input
                id="status-note"
                value={draft.statusNote}
                maxLength={CARD_LIMITS.statusNote}
                placeholder={tStatus("notePlaceholder")}
                onChange={(e) => set({ statusNote: e.target.value })}
              />
            </div>
          </div>
        )}
      </fieldset>

      {mode === "self" && (
        <>
          <div className="grid gap-2">
            <FieldLabel htmlFor="card-bio" aside={<Counter value={draft.bio.length} max={CARD_LIMITS.bio} />}>
              {t("bio")}
            </FieldLabel>
            <Textarea
              id="card-bio"
              value={draft.bio}
              maxLength={CARD_LIMITS.bio}
              rows={3}
              placeholder={t("bioPlaceholder")}
              onChange={(e) => set({ bio: e.target.value })}
              className="resize-y"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="card-availability">{t("availability")}</Label>
            <Input
              id="card-availability"
              value={draft.availability}
              maxLength={CARD_LIMITS.availability}
              placeholder={t("availabilityPlaceholder")}
              onChange={(e) => set({ availability: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <FieldLabel
              aside={
                myTimezone && (
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => set({ timezone: myTimezone })}>
                    {t("timezoneUseMine")}
                  </Button>
                )
              }
            >
              {t("timezone")}
            </FieldLabel>
            <TimezoneSelect
              value={draft.timezone}
              onChange={setTimezone}
              timezones={timezones}
              label={t("timezone")}
              noneLabel={t("timezoneNone")}
            />
            <p className="text-xs text-muted-foreground">{timeThere ? t("timezoneNow", { time: timeThere }) : t("timezoneHelp")}</p>
          </div>

          <div className="grid gap-2">
            <Label>{t("birthday")}</Label>
            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
              <Select value={draft.birthdayDay} onValueChange={(birthdayDay) => set({ birthdayDay })}>
                <SelectTrigger aria-label={t("birthdayDay")} className="w-full">
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
              <Select value={draft.birthdayMonth} onValueChange={(birthdayMonth) => set({ birthdayMonth })}>
                <SelectTrigger aria-label={t("birthdayMonth")} className="w-full">
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
            <p className={partial ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {partial ? t("birthdayIncomplete") : t("birthdayHelp")}
            </p>
          </div>
        </>
      )}

      {!controlled && (
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button variant="secondary" onClick={onCancel}>
              {tCommon("cancel")}
            </Button>
          )}
          <Button onClick={() => void save()} disabled={saving || partial}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tCommon("save")}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Le formulaire dans un dialogue : un gestionnaire qui met un autre membre
 * en pause (mode `status`). Le membre règle sa propre carte dans « Mon profil ».
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
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "self" ? t("title") : t("statusTitle")}</DialogTitle>
        </DialogHeader>
        <WorldMemberCardForm
          worldId={worldId}
          userId={userId}
          mode={mode}
          initial={initial}
          resetKey={open}
          onCancel={() => setOpen(false)}
          onSaved={(fields) => { onSaved(fields); setOpen(false); }}
        />
      </DialogContent>
    </Dialog>
  );
}
