"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { World } from "@/types/worlds";
import type { PersistField, WorldFormValues } from "./worldSettingsSchema";

import type { FeatureSectionId } from "./worldSettingsSections";

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
import { BookOpen, Clock, Map as MapIcon, MessagesSquare, Package, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FIELD, FeaturePage, InactiveOptions, SettingsSection, ToggleItem, ToggleList } from "./FeatureLayout";

/**
 * Les pages « Fonctions » des réglages d'un monde : catalogue (inventaire,
 * compétences, faceclaims), carte, wiki, fiche modèle des personas,
 * chronologie. Le menu de gauche de WorldSettingsView choisit la page
 * (`section`) ; ce composant lui rend l'état de chacune (`onStatusChange`)
 * pour les pastilles Actif / Off.
 *
 * Toujours monté (pour qui peut régler le monde), pages cachées : chacune
 * garde son état d'une visite à l'autre, et l'état des personas, que sa
 * section charge elle-même, est connu du menu dès l'ouverture.
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
export function WorldFeaturesTab({ world, form, persistField, onUpdated, section, onStatusChange }: ProprietesOnglet & {
  onUpdated?: (world: World) => void;
  /** La page affichée ; `null` : une autre section des paramètres est ouverte. */
  section: FeatureSectionId | null;
  /** L'état (actif ou non) de chaque page, à chaque changement. */
  onStatusChange?: (status: Record<FeatureSectionId, boolean>) => void;
}) {
  const t = useTranslations("worlds");
  const tSettings = useTranslations("worlds.settings");
  const tCatalogue = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const { world_timeline, world_live_chat } = useFeatureFlags();

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
    // L'état de la fiche modèle des personas : sa section le charge elle-même.
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

    // Éteinte par défaut en base : seul `true` l'active.
    const [enableLiveChat, setEnableLiveChat] = React.useState(world.enable_live_chat === true);
    const [togglingLiveChat, setTogglingLiveChat] = React.useState(false);

    async function handleLiveChatToggle(enabled: boolean) {
        setTogglingLiveChat(true);
        const res = await setWorldFeature(world.id, "enable_live_chat", enabled);
        setTogglingLiveChat(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        setEnableLiveChat(enabled);
        onUpdated?.({ ...world, enable_live_chat: enabled } as World);
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

    const catalogueActive = enableInventory || enableSkills || enableFaceclaims;
    const sections: { id: FeatureSectionId; icon: LucideIcon; label: string; active: boolean; page: React.ReactNode }[] = [
        {
            id: "catalogue",
            icon: Package,
            label: t("nav.catalogue"),
            active: catalogueActive,
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
                        {/* Toujours visible : grisée tant que la fonction du dessus est coupée. */}
                        <ToggleItem
                            indent
                            dimmed={!enableInventory}
                            title={t("restrictToCatalogue")}
                            help={tSettings("restrictInventoryHelp")}
                            control={
                                <Switch
                                    checked={restrictInventory}
                                    disabled={!enableInventory || togglingRestriction}
                                    onCheckedChange={v => void handleRestrictionToggle("inventory", v)}
                                    aria-label={`${tSettings("inventoryItems")} : ${t("restrictToCatalogue")}`}
                                    className="shrink-0"
                                />
                            }
                        />
                        <ToggleItem
                            title={t("tabSkills")}
                            help={tSettings("skillsHelp")}
                            checked={enableSkills}
                            disabled={togglingEnable}
                            onCheckedChange={v => void handleEnableToggle("skills", v)}
                        />
                        <ToggleItem
                            indent
                            dimmed={!enableSkills}
                            title={t("restrictToCatalogue")}
                            help={tSettings("restrictSkillsHelp")}
                            control={
                                <Switch
                                    checked={restrictSkills}
                                    disabled={!enableSkills || togglingRestriction}
                                    onCheckedChange={v => void handleRestrictionToggle("skills", v)}
                                    aria-label={`${t("tabSkills")} : ${t("restrictToCatalogue")}`}
                                    className="shrink-0"
                                />
                            }
                        />
                        <ToggleItem
                            title={tCatalogue("faceclaims")}
                            help={tSettings("faceclaimsHelp")}
                            checked={enableFaceclaims}
                            disabled={togglingFaceclaims}
                            onCheckedChange={v => void handleFaceclaimsToggle(v)}
                        />
                        <ToggleItem
                            indent
                            dimmed={!enableFaceclaims}
                            title={tSettings("requireFaceclaim")}
                            help={tSettings("requireFaceclaimHelp")}
                            checked={requireFaceclaim}
                            disabled={!enableFaceclaims || togglingRequireFaceclaim}
                            onCheckedChange={v => void handleRequireFaceclaimToggle(v)}
                        />
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
                    {/* Le nom du lien : visible même sans wiki, grisé jusqu'à son activation. */}
                    <InactiveOptions inactive={!enableWiki}>
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
                    </InactiveOptions>
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
                        {/* Visibles même désactivée : on voit ce que la chronologie règle. */}
                        <InactiveOptions inactive={!timelineEnabled}>
                            <TimelineSettings
                                config={timelineConfig}
                                onDraft={(patch) => setTimelineConfig((c) => ({ ...c, ...patch }))}
                                onPersist={(patch) => void persistTimelineConfig(patch)}
                            />
                        </InactiveOptions>
                    </FeaturePage>
                ),
            }]
            : []),
        // La chatbox (chat en direct hors-jeu, migrations 202 et 237) : une
        // fois ouverte au site par le drapeau, chaque monde l'active ou non.
        ...(world_live_chat
            ? [{
                id: "chatbox" as const,
                icon: MessagesSquare,
                label: tSettings("chatbox"),
                active: enableLiveChat,
                page: (
                    <FeaturePage
                        title={tSettings("chatbox")}
                        help={tSettings("chatboxHelp")}
                        toggle={{
                            label: tSettings(enableLiveChat ? "enabledF" : "disabledF"),
                            ariaLabel: tSettings("enableChatbox"),
                            checked: enableLiveChat,
                            disabled: togglingLiveChat,
                            onCheckedChange: v => void handleLiveChatToggle(v),
                        }}
                    />
                ),
            }]
            : []),
    ];

    // Les pastilles du menu de gauche (WorldSettingsView).
    React.useEffect(() => {
        onStatusChange?.({
            catalogue: catalogueActive,
            map: enableMap,
            wiki: enableWiki,
            personas: personasActive,
            timeline: timelineEnabled,
            chatbox: enableLiveChat,
        });
    }, [onStatusChange, catalogueActive, enableMap, enableWiki, personasActive, timelineEnabled, enableLiveChat]);

  return (
    <>
            <div hidden={section === null} data-testid="feature-pages">
                {sections.map((s) => (
                    <div
                        key={s.id}
                        hidden={s.id !== section}
                        role="region"
                        aria-label={s.label}
                        data-feature-page={s.id}
                    >
                        {s.page}
                    </div>
                ))}
            </div>

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
