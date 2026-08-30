"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { TabsContent } from "@/components/ui/tabs";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { World } from "@/types/worlds";
import { LabelWithHelp } from "./LabelWithHelp";
import type { PersistField, WorldFormValues } from "./worldSettingsSchema";

type ProprietesOnglet = {
  world: World;
  form: UseFormReturn<WorldFormValues>;
  persistField: PersistField;
};

import { Plus, Trash2 } from "lucide-react";
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
  setWorldFeature,
  setWorldRestriction,
  setWorldFaceclaims,
  setWorldTimeline,
} from "@/app/actions/worldCatalog";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { WorldPersonaTemplateSection } from "@/components/worlds/settings/WorldPersonaTemplateSection";
import type { WorldTimelineConfig } from "@/types/worlds";
import {
  clampDaysPerMonth,
  DEFAULT_DAYS_PER_MONTH,
  REAL_DAYS_PER_MONTH,
  REAL_MONTH_NAMES,
} from "@/lib/worldTimeline";
import { messageErreurAction } from "@/lib/actionErrors";

/**
 * Onglet « Fonctions » des réglages d'un monde : inventaire et compétences,
 * faceclaims, restriction d'âge, chronologie, fiche modèle.
 *
 * Chaque groupe porte lui-même son état et son appel serveur. C'est ce qui
 * permet de le sortir du composant parent sans défilé de props : seuls le
 * monde, le formulaire et l'enregistrement à la volée descendent.
 *
 * Le parent le monte avec `key={world.id}` : changer de monde le remonte, et
 * les états repartent de `world`. Auparavant un effet les réinitialisait un par
 * un — un oubli dans cette liste et un réglage restait affiché à la valeur du
 * monde précédent.
 */
export function WorldFeaturesTab({ world, form, persistField, onUpdated }: ProprietesOnglet & {
  onUpdated?: (world: World) => void;
}) {
  const t = useTranslations("worlds");
  const tCommon = useTranslations("common");
  const { world_timeline } = useFeatureFlags();

    const [enableInventory, setEnableInventory] = React.useState(world.enable_inventory !== false);
    const [enableSkills, setEnableSkills] = React.useState(world.enable_skills !== false);
    const [restrictInventory, setRestrictInventory] = React.useState(!!world.restrict_inventory);
    const [restrictSkills, setRestrictSkills] = React.useState(!!world.restrict_skills);
    const [pendingRestriction, setPendingRestriction] = React.useState<"inventory" | "skills" | null>(null);
    const [togglingRestriction, setTogglingRestriction] = React.useState(false);
    const [togglingEnable, setTogglingEnable] = React.useState(false);

    const [enableFaceclaims, setEnableFaceclaims] = React.useState(world.enable_faceclaims !== false);
    const [togglingFaceclaims, setTogglingFaceclaims] = React.useState(false);

    // `!== false` et non `=== true` : le monde reçu peut être un objet partiel
    // où la colonne n'a pas été chargée. En base elle est NOT NULL DEFAULT true.
    const [enableMap, setEnableMap] = React.useState(world.enable_map !== false);
    const [togglingMap, setTogglingMap] = React.useState(false);

    const [enableWiki, setEnableWiki] = React.useState(world.enable_wiki !== false);
    const [togglingWiki, setTogglingWiki] = React.useState(false);

    const defaultConfig: WorldTimelineConfig = {
        year_label: "an",
        era_name: null,
        month_names: [],
        current_year: 1,
        current_month: null,
        days_per_month: [],
    };
    const [timelineEnabled, setTimelineEnabled] = React.useState(!!world.timeline_enabled);
    const [timelineConfig, setTimelineConfig] = React.useState<WorldTimelineConfig>(
        world.timeline_config ?? defaultConfig,
    );
    const [togglingTimeline, setTogglingTimeline] = React.useState(false);
    const [newMonthName, setNewMonthName] = React.useState("");

    async function handleEnableToggle(field: "inventory" | "skills", enabled: boolean) {
        setTogglingEnable(true);
        const res = await setWorldFeature(world.id, `enable_${field}`, enabled);
        setTogglingEnable(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        if (field === "inventory") {
            setEnableInventory(enabled);
            if (!enabled) setRestrictInventory(false);
        } else {
            setEnableSkills(enabled);
            if (!enabled) setRestrictSkills(false);
        }
        onUpdated?.({
            ...world,
            [`enable_${field}`]: enabled,
            ...(!enabled ? { [`restrict_${field}`]: false } : {}),
        } as World);
    }

    async function handleRestrictionToggle(field: "inventory" | "skills", enabled: boolean) {
        if (enabled) {
            setPendingRestriction(field);
            return;
        }
        setTogglingRestriction(true);
        const res = await setWorldRestriction(world.id, `restrict_${field}`, false);
        setTogglingRestriction(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        if (field === "inventory") setRestrictInventory(false);
        else setRestrictSkills(false);
        onUpdated?.({ ...world, [`restrict_${field}`]: false } as World);
    }

    async function confirmRestriction() {
        if (!pendingRestriction) return;
        setTogglingRestriction(true);
        const field = pendingRestriction;
        setPendingRestriction(null);
        const res = await setWorldRestriction(world.id, `restrict_${field}`, true);
        setTogglingRestriction(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        if (field === "inventory") setRestrictInventory(true);
        else setRestrictSkills(true);
        onUpdated?.({ ...world, [`restrict_${field}`]: true } as World);
    }

    async function handleFaceclaimsToggle(enabled: boolean) {
        setTogglingFaceclaims(true);
        const res = await setWorldFaceclaims(world.id, enabled);
        setTogglingFaceclaims(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        setEnableFaceclaims(enabled);
        onUpdated?.({ ...world, enable_faceclaims: enabled } as World);
    }

    async function handleMapToggle(enabled: boolean) {
        setTogglingMap(true);
        const res = await setWorldFeature(world.id, "enable_map", enabled);
        setTogglingMap(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        setEnableMap(enabled);
        onUpdated?.({ ...world, enable_map: enabled } as World);
    }

    async function handleWikiToggle(enabled: boolean) {
        setTogglingWiki(true);
        const res = await setWorldFeature(world.id, "enable_wiki", enabled);
        setTogglingWiki(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        setEnableWiki(enabled);
        onUpdated?.({ ...world, enable_wiki: enabled } as World);
    }


    async function handleTimelineToggle(enabled: boolean) {
        setTogglingTimeline(true);
        const res = await setWorldTimeline(world.id, enabled, enabled ? timelineConfig : null);
        setTogglingTimeline(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        setTimelineEnabled(enabled);
        if (!enabled) setTimelineConfig(defaultConfig);
        onUpdated?.({ ...world, timeline_enabled: enabled, timeline_config: enabled ? timelineConfig : null } as World);
    }

    async function persistTimelineConfig(patch: Partial<WorldTimelineConfig>) {
        const next = { ...timelineConfig, ...patch };
        setTimelineConfig(next);
        const res = await setWorldTimeline(world.id, timelineEnabled, next);
        if (!res.ok) toast.error(messageErreurAction(res.error, tCommon));
        else onUpdated?.({ ...world, timeline_config: next } as World);
    }

  return (
    <>
                        <TabsContent value="features" className="mt-0">
                            <div className="mx-auto max-w-xl space-y-6">
                                {/* -- Catalogue -------------------------------- */}
                                <div className="space-y-5">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Catalogue</p>

                                    {/* Objets */}
                                    <div className="space-y-2">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-0.5">
                                                <p className="text-sm font-medium">Objets d&apos;inventaire</p>
                                                <p className="text-xs text-muted-foreground leading-snug">
                                                    Les personas peuvent gérer un inventaire d&apos;objets.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={enableInventory}
                                                disabled={togglingEnable}
                                                onCheckedChange={v => void handleEnableToggle("inventory", v)}
                                                className="shrink-0 mt-0.5"
                                            />
                                        </div>
                                        {enableInventory && (
                                            <div className="ml-4 flex items-start justify-between gap-4 rounded-xl border border-border-soft bg-muted/20 p-3">
                                                <div className="space-y-0.5">
                                                    <p className="text-sm font-medium">{t("restrictToCatalogue")}</p>
                                                    <p className="text-xs text-muted-foreground leading-snug">
                                                        Les personas ne peuvent posséder que des objets définis dans le catalogue — la saisie libre est désactivée.
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={restrictInventory}
                                                    disabled={togglingRestriction}
                                                    onCheckedChange={v => void handleRestrictionToggle("inventory", v)}
                                                    className="shrink-0 mt-0.5"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Compétences */}
                                    <div className="space-y-2">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-0.5">
                                                <p className="text-sm font-medium">{t("tabSkills")}</p>
                                                <p className="text-xs text-muted-foreground leading-snug">
                                                    Les personas peuvent lister leurs compétences.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={enableSkills}
                                                disabled={togglingEnable}
                                                onCheckedChange={v => void handleEnableToggle("skills", v)}
                                                className="shrink-0 mt-0.5"
                                            />
                                        </div>
                                        {enableSkills && (
                                            <div className="ml-4 flex items-start justify-between gap-4 rounded-xl border border-border-soft bg-muted/20 p-3">
                                                <div className="space-y-0.5">
                                                    <p className="text-sm font-medium">{t("restrictToCatalogue")}</p>
                                                    <p className="text-xs text-muted-foreground leading-snug">
                                                        Les personas ne peuvent avoir que des compétences définies dans le catalogue — la saisie libre est désactivée.
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={restrictSkills}
                                                    disabled={togglingRestriction}
                                                    onCheckedChange={v => void handleRestrictionToggle("skills", v)}
                                                    className="shrink-0 mt-0.5"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Faceclaims */}
                                    <div className="space-y-2">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-0.5">
                                                <p className="text-sm font-medium">Faceclaims</p>
                                                <p className="text-xs text-muted-foreground leading-snug">
                                                    Permet aux personas d&apos;indiquer l&apos;acteur ou le personnage sur lequel leur avatar est basé, et affiche un annuaire dans le Catalogue.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={enableFaceclaims}
                                                disabled={togglingFaceclaims}
                                                onCheckedChange={v => void handleFaceclaimsToggle(v)}
                                                className="shrink-0 mt-0.5"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* -- Carte ---------------------------------- */}
                                <div className="space-y-3 pt-2">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("nav.map")}</p>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium">{t("enableMap")}</p>
                                            <p className="text-xs text-muted-foreground leading-snug">
                                                {t("enableMapHelp")}
                                            </p>
                                        </div>
                                        <Switch
                                            checked={enableMap}
                                            disabled={togglingMap}
                                            onCheckedChange={v => void handleMapToggle(v)}
                                            className="shrink-0 mt-0.5"
                                        />
                                    </div>
                                </div>

                                {/* -- Wiki ---------------------------------- */}
                                <div className="space-y-3 pt-2">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wiki</p>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium">{t("enableWiki")}</p>
                                            <p className="text-xs text-muted-foreground leading-snug">
                                                {t("enableWikiHelp")}
                                            </p>
                                        </div>
                                        <Switch
                                            checked={enableWiki}
                                            disabled={togglingWiki}
                                            onCheckedChange={v => void handleWikiToggle(v)}
                                            className="shrink-0 mt-0.5"
                                        />
                                    </div>
                                    <FormField
                                        control={form.control}
                                        name="wiki_label"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    <LabelWithHelp help={t("wikiLabelHelp")}>
                                                        Nom du lien
                                                    </LabelWithHelp>
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="Annexes"
                                                        {...field}
                                                        onBlur={(e) => {
                                                            field.onBlur();
                                                            void persistField("wiki_label", e.target.value.trim());
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* -- Fiche de persona par défaut -------------- */}
                                <WorldPersonaTemplateSection
                                    worldId={world.id}
                                    restrictInventory={restrictInventory}
                                    restrictSkills={restrictSkills}
                                />

                                {/* -- Timeline -------------------------------- */}
                                {world_timeline && (
                                    <div className="space-y-5 pt-2">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chronologie</p>

                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-0.5">
                                                <p className="text-sm font-medium">{t("enableTimeline")}</p>
                                                <p className="text-xs text-muted-foreground leading-snug">
                                                    Permet de situer chaque conversation dans un calendrier fictif.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={timelineEnabled}
                                                disabled={togglingTimeline}
                                                onCheckedChange={v => void handleTimelineToggle(v)}
                                                className="shrink-0 mt-0.5"
                                            />
                                        </div>

                                        {timelineEnabled && (
                                            <div className="space-y-4 rounded-xl border border-border-soft bg-muted/20 p-4">
                                                {/* Année courante */}
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <p className="text-xs font-medium text-muted-foreground">{t("yearLabel")}</p>
                                                        <Input
                                                            value={timelineConfig.year_label}
                                                            placeholder="an"
                                                            className="h-8 text-sm"
                                                            onChange={e => setTimelineConfig(c => ({ ...c, year_label: e.target.value }))}
                                                            onBlur={e => void persistTimelineConfig({ year_label: e.target.value || "an" })}
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <p className="text-xs font-medium text-muted-foreground">{t("eraSuffix")}</p>
                                                        <Input
                                                            value={timelineConfig.era_name ?? ""}
                                                            placeholder={t("eraPlaceholder")}
                                                            className="h-8 text-sm"
                                                            onChange={e => setTimelineConfig(c => ({ ...c, era_name: e.target.value || null }))}
                                                            onBlur={e => void persistTimelineConfig({ era_name: e.target.value || null })}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Année / mois courant */}
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <p className="text-xs font-medium text-muted-foreground">{t("currentYear")}</p>
                                                        <Input
                                                            type="number"
                                                            value={timelineConfig.current_year}
                                                            min={-99999}
                                                            max={99999}
                                                            className="h-8 text-sm"
                                                            onChange={e => setTimelineConfig(c => ({ ...c, current_year: Number(e.target.value) || 1 }))}
                                                            onBlur={e => void persistTimelineConfig({ current_year: Number(e.target.value) || 1 })}
                                                        />
                                                    </div>
                                                    {timelineConfig.month_names.length > 0 && (
                                                        <div className="space-y-1.5">
                                                            <p className="text-xs font-medium text-muted-foreground">Mois actuel</p>
                                                            <select
                                                                value={timelineConfig.current_month ?? ""}
                                                                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                                                                onChange={e => {
                                                                    const v = e.target.value === "" ? null : Number(e.target.value);
                                                                    void persistTimelineConfig({ current_month: v });
                                                                }}
                                                            >
                                                                <option value="">—</option>
                                                                {timelineConfig.month_names.map((m, i) => (
                                                                    <option key={i} value={i}>{m}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Liste des mois — chacun avec son propre nombre de jours (borne le
                                                    calendrier du widget « Raccourcis chronologie » de la page
                                                    d'accueil, voir WorldTimelineShortcutsWidget.tsx). Les deux tableaux
                                                    (`month_names`/`days_per_month`) restent parallèles : tout ajout,
                                                    retrait ou préréglage touche les deux à la fois. */}
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-xs font-medium text-muted-foreground">{t("calendarMonths")}</p>
                                                        {timelineConfig.month_names.length === 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => void persistTimelineConfig({ month_names: REAL_MONTH_NAMES, days_per_month: REAL_DAYS_PER_MONTH })}
                                                                className="text-[11px] text-primary hover:underline"
                                                            >
                                                                Utiliser les mois réels
                                                            </button>
                                                        )}
                                                    </div>
                                                    {timelineConfig.month_names.length > 0 && (
                                                        <div className="space-y-1">
                                                            {timelineConfig.month_names.map((m, i) => (
                                                                <div key={i} className="flex items-center gap-2">
                                                                    <span className="w-4 shrink-0 text-right text-xs text-muted-foreground">{i + 1}.</span>
                                                                    <Input
                                                                        value={m}
                                                                        className="h-7 flex-1 text-sm"
                                                                        onChange={e => {
                                                                            const next = [...timelineConfig.month_names];
                                                                            next[i] = e.target.value;
                                                                            setTimelineConfig(c => ({ ...c, month_names: next }));
                                                                        }}
                                                                        onBlur={e => {
                                                                            const next = [...timelineConfig.month_names];
                                                                            next[i] = e.target.value;
                                                                            void persistTimelineConfig({ month_names: next });
                                                                        }}
                                                                    />
                                                                    <Input
                                                                        type="number"
                                                                        aria-label={`Jours en ${m || `mois ${i + 1}`}`}
                                                                        value={timelineConfig.days_per_month?.[i] ?? DEFAULT_DAYS_PER_MONTH}
                                                                        min={1}
                                                                        max={999}
                                                                        title={t("daysCount")}
                                                                        className="h-7 w-16 shrink-0 text-sm"
                                                                        onChange={e => {
                                                                            const next = [...(timelineConfig.days_per_month ?? [])];
                                                                            next[i] = clampDaysPerMonth(Number(e.target.value));
                                                                            setTimelineConfig(c => ({ ...c, days_per_month: next }));
                                                                        }}
                                                                        onBlur={e => {
                                                                            const next = [...(timelineConfig.days_per_month ?? [])];
                                                                            next[i] = clampDaysPerMonth(Number(e.target.value));
                                                                            void persistTimelineConfig({ days_per_month: next });
                                                                        }}
                                                                    />
                                                                    <button
                                                                      aria-label={tCommon("delete")}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const next = timelineConfig.month_names.filter((_, j) => j !== i);
                                                                            const nextDays = (timelineConfig.days_per_month ?? []).filter((_, j) => j !== i);
                                                                            const currentMonth = timelineConfig.current_month;
                                                                            void persistTimelineConfig({
                                                                                month_names: next,
                                                                                days_per_month: nextDays,
                                                                                current_month: currentMonth !== null && currentMonth >= next.length ? null : currentMonth,
                                                                            });
                                                                        }}
                                                                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className="flex gap-2">
                                                        <Input
                                                            value={newMonthName}
                                                            placeholder={t("monthNamePlaceholder")}
                                                            className="h-8 text-sm"
                                                            onChange={e => setNewMonthName(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === "Enter" && newMonthName.trim()) {
                                                                    e.preventDefault();
                                                                    const next = [...timelineConfig.month_names, newMonthName.trim()];
                                                                    const nextDays = [...(timelineConfig.days_per_month ?? []), DEFAULT_DAYS_PER_MONTH];
                                                                    void persistTimelineConfig({ month_names: next, days_per_month: nextDays });
                                                                    setNewMonthName("");
                                                                }
                                                            }}
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="sm"
                                                            disabled={!newMonthName.trim()}
                                                            aria-label={t("addMonthName")}
                                                            onClick={() => {
                                                                const next = [...timelineConfig.month_names, newMonthName.trim()];
                                                                const nextDays = [...(timelineConfig.days_per_month ?? []), DEFAULT_DAYS_PER_MONTH];
                                                                void persistTimelineConfig({ month_names: next, days_per_month: nextDays });
                                                                setNewMonthName("");
                                                            }}
                                                        >
                                                            <Plus className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </TabsContent>

            {/* Confirmation purge */}
            <AlertDialog open={!!pendingRestriction} onOpenChange={open => { if (!open) setPendingRestriction(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("enableRestrictionTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("restrictionPurgeDescription", {
                                items: t(pendingRestriction === "inventory" ? "restrictionPurgeInventory" : "restrictionPurgeSkills"),
                            })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void confirmRestriction()}>
                            {t("restrictionPurgeConfirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
    </>
  );
}
