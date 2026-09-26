"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { TabsContent } from "@/components/ui/tabs";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { World } from "@/types/worlds";
import { LabelWithHelp } from "./LabelWithHelp";
import type { PersistField, WorldFormValues } from "./worldSettingsSchema";

type ProprietesOnglet = {
  world: World;
  form: UseFormReturn<WorldFormValues>;
  persistField: PersistField;
};

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
    setWorldRequireFaceclaim,
  setWorldTimeline,
} from "@/app/actions/worldCatalog";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { WorldPersonaTemplateSection } from "@/components/worlds/settings/WorldPersonaTemplateSection";
import { TimelineSettings } from "./TimelineSettings";
import type { WorldTimelineConfig } from "@/types/worlds";
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
  const tSettings = useTranslations("worlds.settings");
  const tCatalogue = useTranslations("catalogue");
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
    const [requireFaceclaim, setRequireFaceclaim] = React.useState(!!world.require_faceclaim);
    const [togglingRequireFaceclaim, setTogglingRequireFaceclaim] = React.useState(false);

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

    async function handleRequireFaceclaimToggle(required: boolean) {
        setTogglingRequireFaceclaim(true);
        const res = await setWorldRequireFaceclaim(world.id, required);
        setTogglingRequireFaceclaim(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        setRequireFaceclaim(required);
        onUpdated?.({ ...world, require_faceclaim: required } as World);
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
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("nav.catalogue")}</p>

                                    {/* Objets */}
                                    <div className="space-y-2">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-0.5">
                                                <p className="text-sm font-medium">{tSettings("inventoryItems")}</p>
                                                <p className="text-xs text-muted-foreground leading-snug">
                                                    {tSettings("inventoryItemsHelp")}
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
                                                        {tSettings("restrictInventoryHelp")}
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
                                                    {tSettings("skillsHelp")}
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
                                                        {tSettings("restrictSkillsHelp")}
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
                                                <p className="text-sm font-medium">{tCatalogue("faceclaims")}</p>
                                                <p className="text-xs text-muted-foreground leading-snug">
                                                    {tSettings("faceclaimsHelp")}
                                                </p>
                                            </div>
                                            <Switch
                                                checked={enableFaceclaims}
                                                disabled={togglingFaceclaims}
                                                onCheckedChange={v => void handleFaceclaimsToggle(v)}
                                                className="shrink-0 mt-0.5"
                                            />
                                        </div>
                                        {enableFaceclaims && (
                                            <div className="ml-4 flex items-start justify-between gap-4 rounded-xl border border-border-soft bg-muted/20 p-3">
                                                <div className="space-y-0.5">
                                                    <p className="text-sm font-medium">{tSettings("requireFaceclaim")}</p>
                                                    <p className="text-xs text-muted-foreground leading-snug">
                                                        {tSettings("requireFaceclaimHelp")}
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={requireFaceclaim}
                                                    disabled={togglingRequireFaceclaim}
                                                    onCheckedChange={v => void handleRequireFaceclaimToggle(v)}
                                                    className="shrink-0 mt-0.5"
                                                />
                                            </div>
                                        )}
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
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tSettings("wiki")}</p>
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
                                                        {tSettings("wikiLinkName")}
                                                    </LabelWithHelp>
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder={t("nav.wiki")}
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
                                    reviewEnabled={!!world.persona_review_enabled}
                                    onReviewEnabledChange={(enabled) => onUpdated?.({ ...world, persona_review_enabled: enabled } as World)}
                                />

                                {/* -- Timeline -------------------------------- */}
                                {world_timeline && (
                                    <div className="space-y-5 pt-2">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("nav.timeline")}</p>

                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-0.5">
                                                <p className="text-sm font-medium">{t("enableTimeline")}</p>
                                                <p className="text-xs text-muted-foreground leading-snug">
                                                    {tSettings("timelineHelp")}
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
                                            <TimelineSettings
                                                config={timelineConfig}
                                                onDraft={(patch) => setTimelineConfig((c) => ({ ...c, ...patch }))}
                                                onPersist={(patch) => void persistTimelineConfig(patch)}
                                            />
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
