"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toWebP } from "@/lib/imageUtils";

import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
// Popover + HsvColorPicker : utilisés par HomeColorField, désactivé
// temporairement (voir plus bas) — imports retirés en attendant.
import {
    ChevronLeft,
    ImagePlus,
    Loader2,
    Settings,
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { ImagePickerCropField } from "@/components/ui/image-crop-picker";
import { WorldCategoryManager } from "@/components/worlds/settings/WorldCategoryManager";
import { WorldRelationsSettings } from "@/components/worlds/settings/WorldRelationsSettings";
import { WorldGroupsSettings } from "@/components/worlds/settings/WorldGroupsSettings";
import { WorldHomeGridSettings } from "@/components/worlds/settings/WorldHomeGridSettings";
// Les onglets « Fonctions » et « Communauté » portent leur propre état et
// leurs propres appels serveur — voir l'en-tête de chacun.
import { WorldFeaturesTab } from "./WorldFeaturesTab";
import { WorldCommunityTab } from "./WorldCommunityTab";
import type { ChatroomCategory, World } from "@/types/worlds";

/**
 * Vue plein-écran des paramètres d'un « monde » : un menu à gauche, rangé en
 * groupes (Monde, Fonctions, Personas, Membres — voir
 * worldSettingsSections.ts), et la page de la section choisie à droite. La
 * visibilité de la vue est pilotée par le parent (`?view=settings`) ; la
 * section ouverte, par `&section=…`.
 *
 * Sur mobile : le menu seul tant qu'aucune section n'est demandée, puis la
 * page seule avec un retour vers le menu.
 */

// Sélecteur de couleur désactivé temporairement (voir onglet Apparence) — conservé pour restauration future.
// const COLOR_PRESETS = [
//     { name: "Bleu", value: "#3b82f6" },
//     { name: "Vert", value: "#22c55e" },
//     { name: "Orange", value: "#f97316" },
//     { name: "Violet", value: "#8b5cf6" },
//     { name: "Rouge", value: "#ef4444" },
//     { name: "Rose", value: "#f94b5f" },
// ];




import { WorldReportsTab } from "./WorldReportsTab";
import { WorldActivityTab } from "./WorldActivityTab";
import { currencyUnitsOf } from "@/lib/worldCurrency";
import { WorldRolesTab } from "./WorldRolesTab";
import { WorldAnnouncementsTab } from "./WorldAnnouncementsTab";
import { WorldWelcomeTab } from "./announcements/WorldWelcomeSection";
import { FIELD, FeaturePage, SETTINGS_PAGE_WIDTH, SettingsHeaderProvider, SettingsSection } from "./FeatureLayout";
import { ExploreWorldCard } from "@/app/(protected)/explore/ExploreWorldCard";

/** Une image encore absente : sa place en pointillés, cliquable (ImagePickerCropField). */
function ImagePlaceholder({ label }: { label: string }) {
    return (
        <span className="flex size-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 text-center text-xs text-muted-foreground transition-colors group-hover:bg-muted/60 group-hover:text-foreground">
            <ImagePlus className="size-5" aria-hidden />
            {label}
        </span>
    );
}

/**
 * Une page qui prend toute la hauteur (`data-fill-page`, l'onglet Objets de
 * l'Inventaire) : la zone de défilement passe en flex et ne défile plus, le
 * contenu défile plus bas (le tableau des objets). Les autres pages ne
 * changent pas.
 */
const FILL_AREA =
    "has-[[data-fill-page]]:flex has-[[data-fill-page]]:flex-col has-[[data-fill-page]]:overflow-hidden md:has-[[data-fill-page]]:flex";
const FILL_LINK = "has-[[data-fill-page]]:flex has-[[data-fill-page]]:min-h-0 has-[[data-fill-page]]:flex-1 has-[[data-fill-page]]:flex-col";
import { WorldSettingsNav, useSettingsSectionLabel } from "./WorldSettingsNav";
import {
  SECTION_PARAM,
  isFeatureSection,
  requestedSection,
  urlWithSection,
  visibleSettingsGroups,
  type FeatureSectionId,
  type SettingsSectionId,
} from "./worldSettingsSections";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";
import {
  buildWorldSettingsSchema,
  truthyOrNull,
  type WorldFormValues,
} from "./worldSettingsSchema";
import { STORAGE_CACHE_CONTROL } from "@/lib/storagePaths";

export interface WorldSettingsViewProps {
    world: World;
    onUpdated?: (world: World) => void;
    /** Les catégories de salons déjà lues par le serveur (page Catégories). */
    initialCategories?: ChatroomCategory[];
    /** Le monde a-t-il une fiche par défaut ? (état du menu, sans charger la page) */
    hasPersonaTemplate?: boolean;
}

// Le sélecteur de couleurs de la page d'accueil (`HomeColorField`) vivait ici,
// commenté sur 85 lignes depuis sa désactivation le 2026-08-17 : `WorldHome`
// applique toujours les couleurs du thème. Retiré — git le conserve, voir le
// commit 544205f.

export function WorldSettingsView({ world, onUpdated, initialCategories, hasPersonaTemplate }: WorldSettingsViewProps) {
  const tCommon = useTranslations("common");
  const t = useTranslations("worlds");
  const tSettings = useTranslations("worlds.settings");
  const schema = React.useMemo(() => buildWorldSettingsSchema(tSettings), [tSettings]);
    const supabase = createClient();
    const router = useRouter();
    const { public_worlds, world_timeline, world_live_chat, world_economy } = useFeatureFlags();
    // Chaque section répond à une permission : un membre qui n'a que
    // `roles.manage` voit « Membres › Rôles » et rien d'autre.
    const { can, membership } = useWorldMembership();
    const settings = can("world.settings");
    const allowed = (id: SettingsSectionId): boolean => {
        switch (id) {
            case "general":
            case "home":
            case "items":
            case "map":
            case "wiki":
            case "personas":
            case "skills":
            case "faceclaims":
            // Le Catalogue : fonction réservée, rien à régler pour l'instant.
            case "catalog":
                return settings;
            case "timeline":
                return settings && world_timeline;
            // La chatbox : proposée aux mondes une fois ouverte au site.
            case "chatbox":
                return settings && world_live_chat;
            // L'économie (migrations 246, 249) : idem, derrière son drapeau.
            // Les objets, eux, vivent sans monnaie.
            case "currency":
            case "shops":
            case "trades":
                return settings && world_economy;
            case "community":
                return public_worlds && settings;
            case "categories":
                return settings || can("categories.manage");
            // Les groupes de personas s'écrivent sous `relations.manage` (RLS de
            // `world_persona_groups`) : même permission que les relations.
            case "groups":
            case "relations":
                return settings || can("relations.manage");
            case "roles":
                return settings || can("roles.manage");
            // Signalements (migration 209) : « Gérer les salons » — administrateurs inclus.
            case "reports":
                return can("chatrooms.manage");
            // Annonces (migration 227) : écrire à tous les membres.
            case "announcements":
            case "welcome":
                return can("members.announce");
            // Journal (migration 254) : l'économie, lue par qui la gère.
            case "activity":
                return world_economy && can("economy.manage");
        }
    };
    const groups = visibleSettingsGroups(allowed);
    const sectionLabel = useSettingsSectionLabel();

    // La section ouverte suit l'adresse (lien direct, Précédent / Suivant).
    // L'état local répond tout de suite au clic ; l'adresse le rattrape.
    const searchParams = useSearchParams();
    const param = searchParams?.get(SECTION_PARAM) ?? null;
    const [current, setCurrent] = React.useState<string | null>(param);
    const [prevParam, setPrevParam] = React.useState(param);
    if (param !== prevParam) {
        setPrevParam(param);
        setCurrent(param);
    }
    React.useEffect(() => {
        const onPop = () => setCurrent(new URL(window.location.href).searchParams.get(SECTION_PARAM));
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);
    // Ouverte depuis le menu (et non arrivée par un lien) : le retour mobile
    // revient en arrière dans l'historique plutôt que d'y ajouter une entrée.
    const openedFromMenu = React.useRef(false);
    const requested = requestedSection(current, allowed);
    const shown: SettingsSectionId | null = requested ?? groups[0]?.sections[0] ?? null;

    function openSection(id: SettingsSectionId) {
        if (id === requested) return;
        setCurrent(id);
        openedFromMenu.current = true;
        window.history.pushState(null, "", urlWithSection(window.location.href, id));
    }

    function backToMenu() {
        if (openedFromMenu.current) {
            openedFromMenu.current = false;
            window.history.back();
            return;
        }
        setCurrent(null);
        window.history.replaceState(null, "", urlWithSection(window.location.href, null));
    }

    // L'état des pages « Fonctions », pour les pastilles du menu.
    const [featureStatus, setFeatureStatus] = React.useState<Partial<Record<FeatureSectionId, boolean>>>({});
    // L'id sert au préfixe `user-{id}/…` exigé par la policy du bucket. Pris
    // dans le contexte plutôt que par `auth.getUser()` : cet appel passait par
    // le verrou de session de supabase-js (navigator.locks), qu'un autre onglet
    // peut retenir sous Firefox — l'envoi n'en partait alors jamais.
    const { userId } = useCurrentUser();
    const [uploading, setUploading] = React.useState<null | "icon" | "banner">(null);
    const [deleting, setDeleting] = React.useState(false);



    // homeBodyColor/homePanelColor : voir HomeColorField (désactivé temporairement) plus haut.



    const form = useForm<WorldFormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: world.name ?? "",
            description: world.description ?? "",
            icon_url: world.icon_url ?? "",
            banner_url: world.banner_url ?? "",
            color: world.color ?? "",
            visibility: (world.visibility === "public" ? "public" : "private") as "private" | "public",
            wiki_label: world.wiki_label ?? "",
        },
        mode: "onChange",
    });


    // Réinitialise les valeurs si on change de monde tout en restant sur cette vue.
    React.useEffect(() => {
        form.reset({
            name: world.name ?? "",
            description: world.description ?? "",
            icon_url: world.icon_url ?? "",
            banner_url: world.banner_url ?? "",
            color: world.color ?? "",
            visibility: (world.visibility === "public" ? "public" : "private") as "private" | "public",
            wiki_label: world.wiki_label ?? "",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [world?.id]);


    async function uploadToWorlds(file: File, kind: "icon" | "banner") {
        if (!userId) throw new Error(ERR_NON_AUTHENTIFIE);
        if (file.size > 5 * 1024 * 1024)
            throw new Error("Fichier trop volumineux (max 5 Mo).");

        const converted = await toWebP(file);
        const path = `user-${userId}/world-${world.id}/${kind}-${Date.now()}.webp`;

        const { error } = await supabase.storage
            .from("worlds")
            .upload(path, converted, { cacheControl: STORAGE_CACHE_CONTROL, upsert: true, contentType: converted.type });
        if (error) throw error;

        return supabase.storage.from("worlds").getPublicUrl(path).data
            .publicUrl;
    }

    async function uploadFile(file: File, kind: "icon" | "banner") {
        setUploading(kind);
        try {
            const url = await uploadToWorlds(file, kind);
            const field = kind === "icon" ? "icon_url" : "banner_url";
            form.setValue(field, url, { shouldDirty: true, shouldValidate: true });
            const { error } = await supabase
                .from("worlds")
                .update({ [field]: url })
                .eq("id", world.id);
            if (error) throw error;
            onUpdated?.({ ...world, [field]: url } as World);
            toast.success(tCommon("imageSaved"));
        } catch (e: unknown) {
            // Ne JAMAIS afficher `e.message` : un `throw error` Postgrest y met
            // le message brut de PostgreSQL, qui cite la table et la policy.
            console.error("[WorldSettingsView] envoi d'image", e);
            toast.error(
                e instanceof Error && e.message === ERR_NON_AUTHENTIFIE
                    ? tCommon("sessionExpired")
                    : tCommon("uploadError"),
            );
        } finally {
            setUploading(null);
        }
    }

    async function onIconConfirm(blob: Blob) {
        await uploadFile(new File([blob], "icon.png", { type: blob.type || "image/png" }), "icon");
    }

    async function onBannerConfirm(blob: Blob) {
        await uploadFile(new File([blob], "banner.png", { type: blob.type || "image/png" }), "banner");
    }

    async function persistField(
        field:
            | "name"
            | "description"
            | "icon_url"
            | "banner_url"
            | "color"
            | "visibility"
            | "wiki_label"
            | "home_body_color"
            | "home_panel_color",
        value: string | null,
    ) {
        const clean = truthyOrNull(value);
        try {
            const { error } = await supabase
                .from("worlds")
                .update({ [field]: clean })
                .eq("id", world.id);
            if (error) throw error;
            onUpdated?.({ ...world, [field]: clean } as World);
            toast.success(tCommon("changesSaved"));
        } catch (e: unknown) {
            // Pas `e.message` : texte brut de PostgreSQL, il nomme table et policy.
            console.error("[WorldSettingsView] enregistrement", e);
            toast.error(tCommon("saveError"));
        }
    }

    async function handleDelete() {
        setDeleting(true);
        try {
            const { error } = await supabase
                .from("worlds")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", world.id);
            if (error) throw error;

            toast.success(t("worldDeleted"));
            router.push("/");
            router.refresh();
        } catch (e: unknown) {
            // Pas `e.message` : texte brut de PostgreSQL, il nomme table et policy.
            console.error("[WorldSettingsView] suppression", e);
            toast.error(t("deleteFailed"));
        } finally {
            setDeleting(false);
        }
    }

    const iconUrl = form.watch("icon_url");
    const bannerUrl = form.watch("banner_url");
    // L'aperçu de la carte de l'Explorateur suit la saisie.
    const watchedName = form.watch("name");
    const watchedDescription = form.watch("description");

    /** Une page de réglages : titre, puis son contenu, à sa largeur — calée
     *  contre le menu, pour que le titre ne saute pas d'une section à l'autre.
     *  `ownTitle` : la page porte déjà le sien (FeaturePage), pas de doublon. */
    // Toutes les pages ont la même largeur et la même mise en page que celles
    // des fonctions (FeaturePage) : titre, puis sections à deux colonnes.
    // Le sous-titre d'une page qui n'en porte pas elle-même.
    const pageDescription = (id: SettingsSectionId): string | undefined =>
        id === "roles" ? t("roles.hierarchyHelp") : id === "reports" ? t("reportsIntro") : undefined;
    const page = (id: SettingsSectionId, children: React.ReactNode, ownTitle = false) => (
        <div className={SETTINGS_PAGE_WIDTH} data-settings-page={id}>
            {ownTitle ? children : <FeaturePage title={sectionLabel(id)} description={pageDescription(id)}>{children}</FeaturePage>}
        </div>
    );

    // La barre d'en-tête reçoit le titre de la page ouverte (« Paramètres ›
    // Chatbox ») et ses actions, comme sur Membres : deux emplacements que
    // la page remplit (FeaturePage, par portail). Sur mobile, le menu seul
    // n'y montre que « Paramètres ».
    const [titleSlot, setTitleSlot] = React.useState<HTMLElement | null>(null);
    const [actionsSlot, setActionsSlot] = React.useState<HTMLElement | null>(null);
    const headerSlots = React.useMemo(() => ({ title: titleSlot, actions: actionsSlot }), [titleSlot, actionsSlot]);
    const slotVisibility = requested ? "flex" : "hidden md:flex";

    return (
        <SettingsHeaderProvider value={headerSlots}>
        <div className="flex h-full w-full flex-col">
            <WorldPanelHeader
                icon={<Settings className="h-4 w-4 shrink-0 text-muted-foreground" />}
                title={
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className={cn("shrink-0", shown && "md:font-medium md:text-muted-foreground", requested && "max-md:hidden")}>{t("tabSettings")}</span>
                        <span ref={setTitleSlot} data-testid="settings-header-title" className={cn("min-w-0 items-center gap-1.5", slotVisibility, requested && "max-md:[&>svg:first-child]:hidden")} />
                    </span>
                }
                right={<div ref={setActionsSlot} data-testid="settings-header-actions" className={cn("items-center gap-2", slotVisibility)} />}
            />

            <Form {...form}>
                <div className="flex min-h-0 flex-1">
                    {/* Le menu : toute la largeur sur mobile tant qu'aucune
                        section n'est ouverte ; colonne fixe sur desktop. */}
                    <div
                        className={cn(
                            "min-h-0 shrink-0 overflow-y-auto md:block md:w-60 md:border-r md:border-border",
                            requested ? "hidden" : "w-full",
                        )}
                    >
                        <WorldSettingsNav
                            groups={groups}
                            selected={shown}
                            // Liste mobile sans section ouverte : la section
                            // montrée par défaut n'est surlignée que sur desktop.
                            selectedOnDesktopOnly={!requested}
                            featureStatus={featureStatus}
                            onSelect={openSection}
                        />
                    </div>

                    <div
                        className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:block md:p-6", requested ? FILL_AREA : "hidden")}
                        data-testid="settings-content"
                    >
                        {requested && (
                            <button
                                type="button"
                                onClick={backToMenu}
                                className="-ml-1 mb-4 flex items-center gap-1 rounded-md px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground md:hidden"
                            >
                                <ChevronLeft className="size-4" aria-hidden />
                                {t("tabSettings")}
                            </button>
                        )}

                        {/* ── Général ──────────────────────────────────── */}
                        {shown === "general" && page("general", (
                            <>
                            <form
                                onSubmit={(e) => e.preventDefault()}
                                className="space-y-6"
                            >
                                {/* -- Identité : nom et description, à côté de la carte que
                                     l'Explorateur en montre — on voit ce qu'on écrit. ── */}
                                <SettingsSection title={tSettings("identity")}>
                                <div className="grid gap-5 @xl:grid-cols-[minmax(0,1fr)_14rem]">
                                <div className="space-y-5">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("name")}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder={t("namePlaceholder")}
                                                    className={FIELD}
                                                    {...field}
                                                    onBlur={(e) => {
                                                        field.onBlur();
                                                        const v = e.target.value.trim();
                                                        if (v.length >= 2) void persistField("name", v);
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("description")}</FormLabel>
                                            <p className="text-sm text-muted-foreground">{t("tagHelp")}</p>
                                            <FormControl>
                                                <Textarea
                                                    rows={5}
                                                    placeholder={t("descriptionPlaceholder")}
                                                    className={FIELD}
                                                    {...field}
                                                    onBlur={(e) => {
                                                        field.onBlur();
                                                        void persistField("description", e.target.value);
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                </div>

                                {/* L'aperçu vit avec la saisie ; un clic n'ouvre rien. */}
                                <figure className="space-y-2" data-testid="world-card-preview">
                                    <figcaption className="text-sm font-medium">{tSettings("explorerPreview")}</figcaption>
                                    <div
                                        className="w-56 max-w-full"
                                        onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                        onKeyDownCapture={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); } }}
                                    >
                                        <ExploreWorldCard
                                            world={{
                                                id: world.id,
                                                name: watchedName || world.name,
                                                description: watchedDescription || null,
                                                banner_url: bannerUrl || null,
                                                icon_url: iconUrl || null,
                                                color: world.color ?? null,
                                                allows_real_avatars: world.allows_real_avatars ?? null,
                                                allows_illustrated_avatars: world.allows_illustrated_avatars ?? null,
                                                is_age_restricted: world.is_age_restricted ?? null,
                                            }}
                                            tags={[]}
                                        />
                                    </div>
                                </figure>
                                </div>
                                </SettingsSection>

                                {/* -- Images : une vignette cliquable chacune, plutôt que
                                     deux grandes zones de dépôt vides. ── */}
                                <SettingsSection title={tSettings("images")}>
                                <div className="grid items-start gap-5 @md:grid-cols-[auto_minmax(0,1fr)]">
                                <FormField
                                    control={form.control}
                                    name="icon_url"
                                    render={() => (
                                        <FormItem>
                                            <FormLabel>{tSettings("worldIcon")}</FormLabel>
                                            <ImagePickerCropField
                                                aspect={1}
                                                uploading={uploading === "icon"}
                                                previewSrc={iconUrl || null}
                                                previewClassName="size-24 shrink-0 rounded-lg"
                                                changeLabel={tCommon("dropToReplace")}
                                                placeholder={<ImagePlaceholder label={tSettings("addIcon")} />}
                                                onConfirm={onIconConfirm}
                                            />
                                            {iconUrl && (
                                                <button
                                                    type="button"
                                                    disabled={uploading === "icon"}
                                                    onClick={() => {
                                                        form.setValue("icon_url", "", { shouldDirty: true });
                                                        void persistField("icon_url", "");
                                                    }}
                                                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                                                >
                                                    {tCommon("remove")}
                                                </button>
                                            )}
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="banner_url"
                                    render={() => (
                                        <FormItem>
                                            <FormLabel>{tSettings("banner")}</FormLabel>
                                            <ImagePickerCropField
                                                aspect={16 / 7}
                                                uploading={uploading === "banner"}
                                                previewSrc={bannerUrl || null}
                                                previewClassName="aspect-[16/7] w-full max-w-sm rounded-lg"
                                                changeLabel={tCommon("dropToReplace")}
                                                placeholder={<ImagePlaceholder label={tSettings("addBanner")} />}
                                                onConfirm={onBannerConfirm}
                                            />
                                            {bannerUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        form.setValue("banner_url", "", { shouldDirty: true });
                                                        void persistField("banner_url", "");
                                                    }}
                                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    {tSettings("removeBanner")}
                                                </button>
                                            )}
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                </div>
                                </SettingsSection>

                                {/* -- Couleurs de la page d'accueil : désactivé temporairement
                                     (voir HomeColorField plus haut) — WorldHome applique
                                     toujours les couleurs par défaut du thème. */}
                            </form>

                            {/* Supprimer le monde reste au propriétaire : `world.settings`
                                permet de régler le monde, pas d'en disposer. */}
                            {membership?.isOwner && (
                                <SettingsSection title={tSettings("menu.dangerZone")} description={tSettings("deleteWorldHelp")}>
                                    <DeleteConfirmDialog
                                        title={t("delete")}
                                        description={t("deleteConfirmation")}
                                        confirmLabel={t("delete")}
                                        onConfirm={() => void handleDelete()}
                                        trigger={
                                            <Button type="button" variant="destructive" size="sm" disabled={deleting}>
                                                {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                                {t("delete")}
                                            </Button>
                                        }
                                    />
                                </SettingsSection>
                            )}
                            </>
                        ))}

                        {/* ── Page d'accueil ───────────────────────────── */}
                        {shown === "home" && page("home", (
                            <WorldHomeGridSettings world={world} onUpdated={onUpdated} />
                        ))}

                        {/* ── Communauté ───────────────────────────────── */}
                        {shown === "community" && page("community", (
                            <WorldCommunityTab
                                key={`community-${world.id}`}
                                world={world}
                                form={form}
                                persistField={persistField}
                                onUpdated={onUpdated}
                            />
                        ))}

                        {/* ── Fonctions ────────────────────────────────── */}
                        {/* Toujours monté pour qui règle le monde : les pages gardent
                            leur état, et le menu connaît l'état de chacune. Elles
                            portent leur propre titre (FeaturePage). */}
                        {settings && (
                            <div className={cn(SETTINGS_PAGE_WIDTH, !isFeatureSection(shown) && "hidden", FILL_LINK)}>
                                <WorldFeaturesTab
                                    // La clé REMONTE les pages quand on change de monde.
                                    key={`features-${world.id}`}
                                    world={world}
                                    form={form}
                                    persistField={persistField}
                                    onUpdated={onUpdated}
                                    section={isFeatureSection(shown) ? shown : null}
                                    onStatusChange={setFeatureStatus}
                                    hasPersonaTemplate={hasPersonaTemplate}
                                />
                            </div>
                        )}

                        {/* ── Catalogue (réservé) ──────────────────────── */}
                        {shown === "catalog" && page("catalog", (
                            <p className="text-sm text-muted-foreground">{tSettings("catalogFeature.body")}</p>
                        ))}

                        {/* ── Catégories ───────────────────────────────── */}
                        {shown === "categories" && page("categories", (
                            <WorldCategoryManager key={world.id} worldId={world.id} canEdit initialCategories={initialCategories} />
                        ))}

                        {/* ── Groupes ──────────────────────────────────── */}
                        {shown === "groups" && page("groups", (
                            <WorldGroupsSettings worldId={world.id} />
                        ), true)}

                        {/* ── Relations ────────────────────────────────── */}
                        {shown === "relations" && page("relations", (
                            <WorldRelationsSettings worldId={world.id} />
                        ), true)}

                        {/* ── Rôles ────────────────────────────────────── */}
                        {shown === "roles" && page("roles", (
                            <WorldRolesTab key={`roles-${world.id}`} worldId={world.id} />
                        ))}

                        {/* ── Annonces ─────────────────────────────────── */}
                        {/* L'aperçu en direct se range à droite du formulaire quand la page a sa pleine largeur. */}
                        {shown === "announcements" && page("announcements", (
                            <WorldAnnouncementsTab
                                key={`announcements-${world.id}`}
                                worldId={world.id}
                                worldName={world.name}
                            />
                        ))}

                        {/* ── Message de bienvenue ─────────────────────── */}
                        {shown === "welcome" && page("welcome", (
                            <WorldWelcomeTab key={`welcome-${world.id}`} worldId={world.id} worldName={world.name} />
                        ))}

                        {/* ── Signalements ─────────────────────────────── */}
                        {shown === "reports" && page("reports", (
                            <WorldReportsTab key={`reports-${world.id}`} worldId={world.id} />
                        ))}

                        {/* ── Journal ──────────────────────────────────── */}
                        {shown === "activity" && page("activity", (
                            <WorldActivityTab
                                key={`activity-${world.id}`}
                                worldId={world.id}
                                units={currencyUnitsOf(world.currency_units)}
                            />
                        ))}
                    </div>
                </div>
            </Form>
        </div>
        </SettingsHeaderProvider>
    );
}
