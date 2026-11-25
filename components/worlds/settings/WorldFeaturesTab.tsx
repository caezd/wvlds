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
import { WorldLiveChannelsSettings } from "./WorldLiveChannelsSettings";
import { WorldLiveChatRetentionSetting } from "./WorldLiveChatRetentionSetting";
import { WorldLiveChatOptionsSettings } from "./WorldLiveChatOptionsSettings";
import { WorldLiveChatConnectionSettings } from "./WorldLiveChatConnectionSettings";
import { WorldCurrencySettings } from "./WorldCurrencySettings";
import { WorldInventorySettings } from "./WorldInventorySettings";
import { WorldCatalogBoardSection } from "./WorldCatalogBoardSection";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ShopManager } from "@/components/worlds/shops/ShopManager";
import { WorldGainsSettings } from "./WorldGainsSettings";
import { WorldTaxSettings } from "./WorldTaxSettings";
import type { WorldTimelineConfig } from "@/types/worlds";
import { messageErreurAction } from "@/lib/actionErrors";
import { ArrowRightLeft, BookOpen, Clock, Coins, IdCard, Map as MapIcon, MessagesSquare, Package, ScanFace, Sparkles, Store, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FIELD, FILL, FeaturePage, InactiveOptions, SettingsPageShown, SettingsSection, ToggleItem, ToggleList } from "./FeatureLayout";

/**
 * Les pages « Fonctions » des réglages d'un monde : carte, wiki, personas
 * (fiche modèle, compétences, faceclaims), chronologie, chatbox, et la
 * sous-catégorie Économie (devises, objets, boutiques, échanges). Le menu de gauche de WorldSettingsView choisit la page
 * (`section`) ; ce composant lui rend l'état de chacune (`onStatusChange`)
 * pour les pastilles Actif / Off.
 *
 * Toujours monté (pour qui peut régler le monde), pour donner au menu l'état
 * de chaque page. Une page ne se monte qu'à sa première ouverture (ses données
 * se chargent alors), puis reste montée, cachée : elle garde son état et sa
 * sauvegarde automatique d'une visite à l'autre. L'état de la fiche par défaut
 * vient du serveur (`hasPersonaTemplate`), sans monter sa page.
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
export function WorldFeaturesTab({ world, form, persistField, onUpdated, section, onStatusChange, hasPersonaTemplate }: ProprietesOnglet & {
  onUpdated?: (world: World) => void;
  /** La page affichée ; `null` : une autre section des paramètres est ouverte. */
  section: FeatureSectionId | null;
  /** L'état (actif ou non) de chaque page, à chaque changement. */
  onStatusChange?: (status: Record<FeatureSectionId, boolean>) => void;
  /** Le monde a-t-il une fiche par défaut ? Lu par le serveur, pour le menu. */
  hasPersonaTemplate?: boolean;
}) {
  const t = useTranslations("worlds");
  const tSettings = useTranslations("worlds.settings");
  const tCatalogue = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const tShops = useTranslations("shops");
  const { world_timeline, world_live_chat, world_economy } = useFeatureFlags();

    const [enableInventory, setEnableInventory] = React.useState(world.enable_inventory !== false);
    const [enableSkills, setEnableSkills] = React.useState(world.enable_skills !== false);
    // L'onglet ouvert de la page Inventaire : « Objets » y prend toute la hauteur.
    const [inventoryTab, setInventoryTab] = React.useState<"settings" | "items">("settings");
    // Les pages dont le tableau prend toute la hauteur : l'onglet Objets de
    // l'Inventaire, et les Compétences.
    const fillPage = (section === "items" && inventoryTab === "items") || section === "skills";
    const [restrictSkills, setRestrictSkills] = React.useState(!!world.restrict_skills);
    const [pendingRestriction, setPendingRestriction] = React.useState<"skills" | null>(null);
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
    // L'état de la fiche modèle des personas : lu par le serveur, puis tenu
    // à jour par sa page une fois ouverte.
    const [personasActive, setPersonasActive] = React.useState(!!hasPersonaTemplate);
    // Les pages déjà ouvertes : seules celles-ci sont montées (voir plus haut).
    const [opened, setOpened] = React.useState<ReadonlySet<FeatureSectionId>>(
        () => new Set(section ? [section] : []),
    );
    if (section && !opened.has(section)) setOpened(new Set([...opened, section]));

    async function handleEnableToggle(field: "inventory" | "skills", enabled: boolean) {
        setTogglingEnable(true);
        const res = await setWorldFeature(world.id, `enable_${field}`, enabled);
        setTogglingEnable(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        if (field === "inventory") {
            setEnableInventory(enabled);
        } else {
            setEnableSkills(enabled);
            if (!enabled) setRestrictSkills(false);
        }
        onUpdated?.({
            ...world,
            [`enable_${field}`]: enabled,
            ...(!enabled && field === "skills" ? { restrict_skills: false } : {}),
        } as World);
    }

    async function handleRestrictionToggle(field: "skills", enabled: boolean) {
        if (enabled) {
            setPendingRestriction(field);
            return;
        }
        setTogglingRestriction(true);
        const res = await setWorldRestriction(world.id, `restrict_${field}`, false);
        setTogglingRestriction(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        setRestrictSkills(false);
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
        setRestrictSkills(true);
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

    // L'économie (migration 246) : éteinte par défaut, seul `true` l'active.
    const [enableEconomy, setEnableEconomy] = React.useState(world.enable_economy === true);
    const [togglingEconomy, setTogglingEconomy] = React.useState(false);

    async function handleEconomyToggle(enabled: boolean) {
        setTogglingEconomy(true);
        const res = await setWorldFeature(world.id, "enable_economy", enabled);
        setTogglingEconomy(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        setEnableEconomy(enabled);
        onUpdated?.({ ...world, enable_economy: enabled } as World);
    }

    // Les boutiques (migration 250) : coupées par défaut, ouvertes seulement
    // avec l'économie et les objets.
    const [enableShops, setEnableShops] = React.useState(world.enable_shops === true);
    const [togglingShops, setTogglingShops] = React.useState(false);
    const shopsOpen = enableShops && enableEconomy && enableInventory;

    async function handleShopsToggle(enabled: boolean) {
        setTogglingShops(true);
        const res = await setWorldFeature(world.id, "enable_shops", enabled);
        setTogglingShops(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        setEnableShops(enabled);
        onUpdated?.({ ...world, enable_shops: enabled } as World);
    }

    // Les échanges (migration 251) : coupés par défaut, possibles dès qu'il y
    // a de quoi échanger (la monnaie ou les objets).
    const [enableTrades, setEnableTrades] = React.useState(world.enable_trades === true);
    const [tradesSameAccount, setTradesSameAccount] = React.useState(world.trades_same_account === true);
    const [togglingTrades, setTogglingTrades] = React.useState(false);
    const tradesPossible = enableEconomy || enableInventory;
    const tradesOpen = enableTrades && tradesPossible;

    async function handleTradesToggle(field: "enable_trades" | "trades_same_account", enabled: boolean) {
        setTogglingTrades(true);
        const res = await setWorldFeature(world.id, field, enabled);
        setTogglingTrades(false);
        if (!res.ok) { toast.error(messageErreurAction(res.error, tCommon)); return; }
        if (field === "enable_trades") {
            setEnableTrades(enabled);
            // L'action retombe aussi l'option du même compte (RESTRICTION_LIEE).
            if (!enabled) setTradesSameAccount(false);
            onUpdated?.({ ...world, enable_trades: enabled, ...(enabled ? {} : { trades_same_account: false }) } as World);
        } else {
            setTradesSameAccount(enabled);
            onUpdated?.({ ...world, trades_same_account: enabled } as World);
        }
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

    const sections: { id: FeatureSectionId; icon: LucideIcon; label: string; active: boolean; page: React.ReactNode }[] = [
        {
            id: "map",
            icon: MapIcon,
            label: t("nav.map"),
            active: enableMap,
            page: (
                <FeaturePage
                    title={t("nav.map")}
                    description={t("enableMapHelp")}
                    toggle={{
                        ariaLabel: t("enableMap"),
                        help: tSettings("disableKeeps"),
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
                    description={t("enableWikiHelp")}
                    toggle={{
                        ariaLabel: t("enableWiki"),
                        help: tSettings("disableKeeps"),
                        checked: enableWiki,
                        disabled: togglingWiki,
                        onCheckedChange: v => void handleWikiToggle(v),
                    }}
                >
                    {/* Le nom du lien : visible même sans wiki, grisé jusqu'à son activation. */}
                    <InactiveOptions inactive={!enableWiki} feature={{ onActivate: () => void handleWikiToggle(true), disabled: togglingWiki }}>
                        <SettingsSection title={tSettings("wikiLinkName")} description={t("wikiLabelHelp")}>
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
        // Fonctions › Personas : la fiche par défaut, les compétences et les
        // faceclaims, chacun sa page (demande du 2026-11-24).
        {
            id: "personas",
            icon: IdCard,
            label: tSettings("personaSheet"),
            active: personasActive,
            page: (
                <WorldPersonaTemplateSection
                        title={tSettings("personaSheet")}
                        description={tSettings("personasHelp")}
                        worldId={world.id}
                        restrictSkills={restrictSkills}
                        reviewEnabled={!!world.persona_review_enabled}
                        onReviewEnabledChange={(enabled) => onUpdated?.({ ...world, persona_review_enabled: enabled } as World)}
                        onActiveChange={setPersonasActive}
                    />
            ),
        },
        {
            id: "skills",
            icon: Sparkles,
            label: t("tabSkills"),
            active: enableSkills,
            page: (
                <FeaturePage
                    title={t("tabSkills")}
                    description={tSettings("skillsHelp")}
                    toggle={{
                        ariaLabel: tSettings("enableSkills"),
                        checked: enableSkills,
                        disabled: togglingEnable,
                        onCheckedChange: v => void handleEnableToggle("skills", v),
                    }}
                    fill={section === "skills"}
                >
                    <InactiveOptions inactive={!enableSkills} className={FILL} feature={{ onActivate: () => void handleEnableToggle("skills", true), disabled: togglingEnable }}>
                        <div className={cn(FILL, "gap-6")}>
                            <ToggleList className="shrink-0">
                                <ToggleItem
                                    title={t("restrictToCatalogue")}
                                    description={tSettings("restrictSkillsHelp")}
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
                            </ToggleList>
                            {/* Le tableau ne se charge qu'à l'ouverture de la page. */}
                            {section === "skills" && <WorldCatalogBoardSection worldId={world.id} type="skills" />}
                        </div>
                    </InactiveOptions>
                </FeaturePage>
            ),
        },
        {
            id: "faceclaims",
            icon: ScanFace,
            label: tCatalogue("faceclaims"),
            active: enableFaceclaims,
            page: (
                <FeaturePage
                    title={tCatalogue("faceclaims")}
                    description={tSettings("faceclaimsHelp")}
                    toggle={{
                        ariaLabel: tSettings("enableFaceclaims"),
                        checked: enableFaceclaims,
                        disabled: togglingFaceclaims,
                        onCheckedChange: v => void handleFaceclaimsToggle(v),
                    }}
                >
                    <InactiveOptions inactive={!enableFaceclaims} feature={{ onActivate: () => void handleFaceclaimsToggle(true), disabled: togglingFaceclaims }}>
                        <ToggleList>
                            <ToggleItem
                                title={tSettings("requireFaceclaim")}
                                description={tSettings("requireFaceclaimHelp")}
                                checked={requireFaceclaim}
                                disabled={!enableFaceclaims || togglingRequireFaceclaim}
                                onCheckedChange={v => void handleRequireFaceclaimToggle(v)}
                            />
                        </ToggleList>
                    </InactiveOptions>
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
                        description={tSettings("timelineHelp")}
                        toggle={{
                            ariaLabel: t("enableTimeline"),
                            checked: timelineEnabled,
                            disabled: togglingTimeline,
                            onCheckedChange: v => void handleTimelineToggle(v),
                        }}
                    >
                        {/* Visibles même désactivée : on voit ce que la chronologie règle. */}
                        <InactiveOptions inactive={!timelineEnabled} feature={{ onActivate: () => void handleTimelineToggle(true), disabled: togglingTimeline }}>
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
                        description={tSettings("chatboxHelp")}
                        toggle={{
                            ariaLabel: tSettings("enableChatbox"),
                            help: tSettings("disableKeeps"),
                            checked: enableLiveChat,
                            disabled: togglingLiveChat,
                            onCheckedChange: v => void handleLiveChatToggle(v),
                        }}
                    >
                        {/* Les salles : visibles même chatbox coupée, grisées. */}
                        <InactiveOptions inactive={!enableLiveChat} feature={{ onActivate: () => void handleLiveChatToggle(true), disabled: togglingLiveChat }}>
                            <WorldLiveChannelsSettings worldId={world.id} />
                            <WorldLiveChatOptionsSettings
                                world={world}
                                onUpdated={(patch) => onUpdated?.({ ...world, ...patch } as World)}
                            />
                            <WorldLiveChatConnectionSettings
                                world={world}
                                onUpdated={(patch) => onUpdated?.({ ...world, ...patch } as World)}
                            />
                            <WorldLiveChatRetentionSetting
                                worldId={world.id}
                                value={world.live_chat_retention}
                                onSaved={(retention) => onUpdated?.({ ...world, live_chat_retention: retention } as World)}
                            />
                        </InactiveOptions>
                    </FeaturePage>
                ),
            }]
            : []),
        // Fonctions › Économie : la monnaie et la bourse des personas (migration
        // 246), les objets et l'inventaire (247), les boutiques (249, 250).
        ...(world_economy
            ? [{
                id: "currency" as const,
                icon: Coins,
                label: tSettings("economy.currencies"),
                active: enableEconomy,
                page: (
                    <FeaturePage
                        title={tSettings("economy.currencies")}
                        description={tSettings("economy.help")}
                        toggle={{
                            ariaLabel: tSettings("economy.enable"),
                            help: tSettings("disableKeeps"),
                            checked: enableEconomy,
                            disabled: togglingEconomy,
                            onCheckedChange: v => void handleEconomyToggle(v),
                        }}
                    >
                        <InactiveOptions inactive={!enableEconomy} feature={{ onActivate: () => void handleEconomyToggle(true), disabled: togglingEconomy }}>
                            <WorldCurrencySettings
                                world={world}
                                onUpdated={(patch) => onUpdated?.({ ...world, ...patch } as World)}
                            />
                            {/* Les gains automatiques (migration 252) : la monnaie se gagne en jouant. */}
                            <WorldGainsSettings
                                world={world}
                                onUpdated={(patch) => onUpdated?.({ ...world, ...patch } as World)}
                            />
                            {/* La taxe des personas (migration 255). */}
                            <WorldTaxSettings
                                world={world}
                                onUpdated={(patch) => onUpdated?.({ ...world, ...patch } as World)}
                            />
                        </InactiveOptions>
                    </FeaturePage>
                ),
            }]
            : []),
        {
            id: "items" as const,
            icon: Package,
            label: tSettings("inventoryPage"),
            active: enableInventory,
            page: (
                <FeaturePage
                    title={tSettings("inventoryPage")}
                    description={tSettings("inventoryItemsHelp")}
                    toggle={{
                        ariaLabel: tSettings("enableInventory"),
                        checked: enableInventory,
                        disabled: togglingEnable,
                        onCheckedChange: v => void handleEnableToggle("inventory", v),
                    }}
                    fill={fillPage}
                >
                    {/* Deux onglets : les réglages de l'inventaire des personas (migration
                        247), puis les objets du catalogue en tableau. Radix ne monte que
                        l'onglet ouvert : le catalogue ne se charge qu'à la demande. */}
                    <TabsPrimitive.Root
                        value={inventoryTab}
                        onValueChange={(v) => setInventoryTab(v === "items" ? "items" : "settings")}
                        className={cn(fillPage && FILL)}
                    >
                        {/* La bascule grise de Membres ou Personas pour changer de vue,
                            plutôt que des onglets soulignés. */}
                        <TabsPrimitive.List className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5">
                            {(["settings", "items"] as const).map((v) => (
                                <TabsPrimitive.Trigger
                                    key={v}
                                    value={v}
                                    className="flex h-full items-center rounded-sm px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-muted data-[state=active]:text-foreground"
                                >
                                    {v === "settings" ? tSettings("inventory.tabSettings") : tSettings("catalogBoard.inventory.title")}
                                </TabsPrimitive.Trigger>
                            ))}
                        </TabsPrimitive.List>
                        {/* Grisé tant que l’inventaire est coupé. */}
                        <TabsPrimitive.Content value="settings" className="pt-6">
                            <InactiveOptions inactive={!enableInventory} feature={{ onActivate: () => void handleEnableToggle("inventory", true), disabled: togglingEnable }}>
                                <WorldInventorySettings
                                    world={world}
                                    onUpdated={(patch) => onUpdated?.({ ...world, ...patch } as World)}
                                />
                            </InactiveOptions>
                        </TabsPrimitive.Content>
                        <TabsPrimitive.Content value="items" className={cn("pt-6", FILL)}>
                            <InactiveOptions inactive={!enableInventory} className={FILL} feature={{ onActivate: () => void handleEnableToggle("inventory", true), disabled: togglingEnable }}>
                                <WorldCatalogBoardSection worldId={world.id} type="inventory" />
                            </InactiveOptions>
                        </TabsPrimitive.Content>
                    </TabsPrimitive.Root>
                </FeaturePage>
            ),
        },
        ...(world_economy
            ? [{
                id: "shops" as const,
                icon: Store,
                label: tShops("title"),
                active: shopsOpen,
                page: (
                    <FeaturePage
                        title={tShops("title")}
                        description={tSettings("shopsHelp")}
                        toggle={{
                            ariaLabel: tSettings("enableShops"),
                            checked: enableShops,
                            // Sans monnaie ni objets, une boutique n'aurait rien à vendre.
                            disabled: togglingShops || !enableEconomy || !enableInventory,
                            onCheckedChange: v => void handleShopsToggle(v),
                        }}
                    >
                        {!(enableEconomy && enableInventory) && (
                            <p className="text-sm text-muted-foreground">{tSettings("shopsNeedEconomy")}</p>
                        )}
                        {/* Boutiques, articles, prix, stocks et rachats (la vue du monde ne garde que la vitrine). */}
                        <InactiveOptions inactive={!shopsOpen} feature={{ onActivate: enableEconomy && enableInventory ? () => void handleShopsToggle(true) : undefined, disabled: togglingShops }}>
                            <ShopManager worldId={world.id} />
                        </InactiveOptions>
                    </FeaturePage>
                ),
            }]
            : []),
        ...(world_economy
            ? [{
                id: "trades" as const,
                icon: ArrowRightLeft,
                label: tSettings("trades"),
                active: tradesOpen,
                page: (
                    <FeaturePage
                        title={tSettings("trades")}
                        description={tSettings("tradesHelp")}
                        toggle={{
                            ariaLabel: tSettings("enableTrades"),
                            checked: enableTrades,
                            // Sans monnaie ni objets, rien à échanger.
                            disabled: togglingTrades || !tradesPossible,
                            onCheckedChange: v => void handleTradesToggle("enable_trades", v),
                        }}
                    >
                        {!tradesPossible && (
                            <p className="text-sm text-muted-foreground">{tSettings("tradesNeedSomething")}</p>
                        )}
                        <InactiveOptions inactive={!tradesOpen} feature={{ onActivate: tradesPossible ? () => void handleTradesToggle("enable_trades", true) : undefined, disabled: togglingTrades }}>
                            <ToggleList>
                                <ToggleItem
                                    title={tSettings("tradesSameAccount")}
                                    checked={tradesSameAccount}
                                    disabled={!tradesOpen || togglingTrades}
                                    onCheckedChange={v => void handleTradesToggle("trades_same_account", v)}
                                />
                            </ToggleList>
                        </InactiveOptions>
                    </FeaturePage>
                ),
            }]
            : []),
    ];

    // Les pastilles du menu de gauche (WorldSettingsView).
    React.useEffect(() => {
        onStatusChange?.({
            map: enableMap,
            wiki: enableWiki,
            personas: personasActive,
            skills: enableSkills,
            faceclaims: enableFaceclaims,
            timeline: timelineEnabled,
            chatbox: enableLiveChat,
            currency: enableEconomy,
            items: enableInventory,
            shops: shopsOpen,
            trades: tradesOpen,
        });
    }, [onStatusChange, enableMap, enableWiki, personasActive, enableSkills, enableFaceclaims, timelineEnabled, enableLiveChat, enableEconomy, enableInventory, shopsOpen, tradesOpen]);

  return (
    <>
            {/* Une page qui prend toute la hauteur (l'onglet Objets de l'Inventaire)
                porte `data-fill-page` : la zone de défilement des réglages se met
                alors en flex (WorldSettingsView, `has-[[data-fill-page]]`) et la
                chaîne descend jusqu'au tableau, qui défile seul. */}
            <div hidden={section === null} data-testid="feature-pages" className={cn(fillPage && FILL)}>
                {sections.map((s) => (
                    <div
                        key={s.id}
                        hidden={s.id !== section}
                        role="region"
                        aria-label={s.label}
                        data-feature-page={s.id}
                        data-fill-page={(fillPage && s.id === section) || undefined}
                        className={cn(fillPage && s.id === section && FILL)}
                    >
                        <SettingsPageShown value={s.id === section}>
                            {opened.has(s.id) && s.page}
                        </SettingsPageShown>
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
                                items: t("restrictionPurgeSkills"),
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
