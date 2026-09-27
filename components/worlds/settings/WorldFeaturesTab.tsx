"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { TabsContent } from "@/components/ui/tabs";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { World } from "@/types/worlds";
import type { PersistField, WorldFormValues } from "./worldSettingsSchema";

/** Les catégories de fonctions, dans la colonne de gauche. */
type FeatureSectionId = "catalogue" | "map" | "wiki" | "personas" | "timeline";

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
import { BookOpen, Clock, Map as MapIcon, Package, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FIELD, FeaturePage, SettingsSection, StatusPill, ToggleItem, ToggleList } from "./FeatureLayout";

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
    // La catégorie affichée, et l'état de celle des personas (sa section le
    // charge elle-même).
    const [sectionId, setSectionId] = React.useState<FeatureSectionId>("catalogue");
    const [personasActive, setPersonasActive] = React.useState(false);

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

    const on = tSettings("statusOn");
    const off = tSettings("statusOff");
    const sections: { id: FeatureSectionId; icon: LucideIcon; label: string; active: boolean; page: React.ReactNode }[] = [
        {
            id: "catalogue",
            icon: Package,
            label: t("nav.catalogue"),
            active: enableInventory || enableSkills || enableFaceclaims,
            page: (
                <FeaturePage title={t("nav.catalogue")} help={tSettings("catalogueHelp")}>
                    <ToggleList>
                        <ToggleItem
                            title={tSettings("inventoryItems")}
                            help={tSettings("inventoryItemsHelp")}
                            checked={enableInventory}
                            disabled={togglingEnable}
                            onCheckedChange={v => void handleEnableToggle("inventory", v)}
                        />
                        {enableInventory && (
                            <ToggleItem
                                indent
                                title={t("restrictToCatalogue")}
                                help={tSettings("restrictInventoryHelp")}
                                control={
                                    <Switch
                                        checked={restrictInventory}
                                        disabled={togglingRestriction}
                                        onCheckedChange={v => void handleRestrictionToggle("inventory", v)}
                                        aria-label={`${tSettings("inventoryItems")} : ${t("restrictToCatalogue")}`}
                                        className="shrink-0"
                                    />
                                }
                            />
                        )}
                        <ToggleItem
                            title={t("tabSkills")}
                            help={tSettings("skillsHelp")}
                            checked={enableSkills}
                            disabled={togglingEnable}
                            onCheckedChange={v => void handleEnableToggle("skills", v)}
                        />
                        {enableSkills && (
                            <ToggleItem
                                indent
                                title={t("restrictToCatalogue")}
                                help={tSettings("restrictSkillsHelp")}
                                control={
                                    <Switch
                                        checked={restrictSkills}
                                        disabled={togglingRestriction}
                                        onCheckedChange={v => void handleRestrictionToggle("skills", v)}
                                        aria-label={`${t("tabSkills")} : ${t("restrictToCatalogue")}`}
                                        className="shrink-0"
                                    />
                                }
                            />
                        )}
                        <ToggleItem
                            title={tCatalogue("faceclaims")}
                            help={tSettings("faceclaimsHelp")}
                            checked={enableFaceclaims}
                            disabled={togglingFaceclaims}
                            onCheckedChange={v => void handleFaceclaimsToggle(v)}
                        />
                        {enableFaceclaims && (
                            <ToggleItem
                                indent
                                title={tSettings("requireFaceclaim")}
                                help={tSettings("requireFaceclaimHelp")}
                                checked={requireFaceclaim}
                                disabled={togglingRequireFaceclaim}
                                onCheckedChange={v => void handleRequireFaceclaimToggle(v)}
                            />
                        )}
                    </ToggleList>
                </FeaturePage>
            ),
        },
        {
            id: "map",
            icon: MapIcon,
            label: t("nav.map"),
            active: enableMap,
            page: (
                <FeaturePage
                    title={t("nav.map")}
                    help={t("enableMapHelp")}
                    toggle={{
                        label: tSettings(enableMap ? "enabledF" : "disabledF"),
                        ariaLabel: t("enableMap"),
                        checked: enableMap,
                        disabled: togglingMap,
                        onCheckedChange: v => void handleMapToggle(v),
                    }}
                />
            ),
        },
        {
            id: "wiki",
            icon: BookOpen,
            label: tSettings("wiki"),
            active: enableWiki,
            page: (
                <FeaturePage
                    title={tSettings("wiki")}
                    help={t("enableWikiHelp")}
                    toggle={{
                        label: tSettings(enableWiki ? "enabledM" : "disabledM"),
                        ariaLabel: t("enableWiki"),
                        checked: enableWiki,
                        disabled: togglingWiki,
                        onCheckedChange: v => void handleWikiToggle(v),
                    }}
                >
                    {/* Le nom du lien : sans wiki, il n'a pas lieu d'être. */}
                    {enableWiki && (
                        <SettingsSection title={tSettings("wikiLinkName")} help={t("wikiLabelHelp")}>
                            <FormField
                                control={form.control}
                                name="wiki_label"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <Input
                                                placeholder={t("nav.wiki")}
                                                aria-label={tSettings("wikiLinkName")}
                                                className={cn("h-10 max-w-sm rounded-md text-sm", FIELD)}
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
                        </SettingsSection>
                    )}
                </FeaturePage>
            ),
        },
        {
            id: "personas",
            icon: UserRound,
            label: t("nav.personas"),
            active: personasActive,
            page: (
                <FeaturePage title={t("nav.personas")} help={tSettings("personasHelp")}>
                    <WorldPersonaTemplateSection
                        worldId={world.id}
                        restrictInventory={restrictInventory}
                        restrictSkills={restrictSkills}
                        reviewEnabled={!!world.persona_review_enabled}
                        onReviewEnabledChange={(enabled) => onUpdated?.({ ...world, persona_review_enabled: enabled } as World)}
                        onActiveChange={setPersonasActive}
                    />
                </FeaturePage>
            ),
        },
        ...(world_timeline
            ? [{
                id: "timeline" as const,
                icon: Clock,
                label: t("nav.timeline"),
                active: timelineEnabled,
                page: (
                    <FeaturePage
                        title={t("nav.timeline")}
                        help={tSettings("timelineHelp")}
                        toggle={{
                            label: tSettings(timelineEnabled ? "enabledF" : "disabledF"),
                            ariaLabel: t("enableTimeline"),
                            checked: timelineEnabled,
                            disabled: togglingTimeline,
                            onCheckedChange: v => void handleTimelineToggle(v),
                        }}
                    >
                        {timelineEnabled && (
                            <TimelineSettings
                                config={timelineConfig}
                                onDraft={(patch) => setTimelineConfig((c) => ({ ...c, ...patch }))}
                                onPersist={(patch) => void persistTimelineConfig(patch)}
                            />
                        )}
                    </FeaturePage>
                ),
            }]
            : []),
    ];


  return (
    <>
                        <TabsContent value="features" className="mt-0">
                            {/* Les catégories à gauche, avec leur état ; la page de
                                celle choisie à droite. Toutes restent montées (seule
                                la choisie paraît) : chacune garde son état, et
                                celui des personas, chargé par sa section, reste juste
                                dans la colonne. */}
                            <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:gap-10">
                                <nav
                                    aria-label={tSettings("featuresNav")}
                                    className="shrink-0 md:w-52 md:border-r md:border-border-soft md:pr-4"
                                >
                                    <p className="px-2.5 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground" aria-hidden>
                                        {tSettings("featuresTitle")}
                                    </p>
                                    <ul className="space-y-0.5">
                                        {sections.map((section) => {
                                            const selected = section.id === sectionId;
                                            const Icon = section.icon;
                                            return (
                                                <li key={section.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSectionId(section.id)}
                                                        aria-current={selected ? "page" : undefined}
                                                        // Nommé par sa catégorie ; son état se lit en description.
                                                        aria-label={section.label}
                                                        aria-describedby={`feature-status-${section.id}`}
                                                        className={cn(
                                                            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                                                            selected ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                                                        )}
                                                    >
                                                        <Icon className="size-4 shrink-0" aria-hidden />
                                                        <span className="min-w-0 flex-1 truncate">{section.label}</span>
                                                        <StatusPill id={`feature-status-${section.id}`} active={section.active} onLabel={on} offLabel={off} />
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </nav>

                                <div className="min-w-0 flex-1">
                                    {sections.map((section) => (
                                        <div
                                            key={section.id}
                                            hidden={section.id !== sectionId}
                                            role="region"
                                            aria-label={section.label}
                                            data-feature-page={section.id}
                                        >
                                            {section.page}
                                        </div>
                                    ))}
                                </div>
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
