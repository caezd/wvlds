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
import type { World } from "@/types/worlds";

/**
 * Vue plein-écran des paramètres d'un « monde » : un menu à gauche, rangé en
 * groupes (Monde, Fonctions, Salons & personas, Membres — voir
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




import { LabelWithHelp } from "./LabelWithHelp";
import { WorldReportsTab } from "./WorldReportsTab";
import { WorldRolesTab } from "./WorldRolesTab";
import { WorldAnnouncementsTab } from "./WorldAnnouncementsTab";
import { SettingsSection } from "./FeatureLayout";
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
}

// Le sélecteur de couleurs de la page d'accueil (`HomeColorField`) vivait ici,
// commenté sur 85 lignes depuis sa désactivation le 2026-08-17 : `WorldHome`
// applique toujours les couleurs du thème. Retiré — git le conserve, voir le
// commit 544205f.

export function WorldSettingsView({ world, onUpdated }: WorldSettingsViewProps) {
  const tCommon = useTranslations("common");
  const t = useTranslations("worlds");
  const tSettings = useTranslations("worlds.settings");
  const schema = React.useMemo(() => buildWorldSettingsSchema(tSettings), [tSettings]);
    const supabase = createClient();
    const router = useRouter();
    const { public_worlds, world_timeline } = useFeatureFlags();
    // Chaque section répond à une permission : un membre qui n'a que
    // `roles.manage` voit « Membres › Rôles » et rien d'autre.
    const { can, membership } = useWorldMembership();
    const settings = can("world.settings");
    const allowed = (id: SettingsSectionId): boolean => {
        switch (id) {
            case "general":
            case "home":
            case "catalogue":
            case "map":
            case "wiki":
            case "personas":
                return settings;
            case "timeline":
                return settings && world_timeline;
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
                return can("members.announce");
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
    const [confirmDelete, setConfirmDelete] = React.useState(false);
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
        setConfirmDelete(false);
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
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }
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

    /** Une page de réglages : titre, puis son contenu, à sa largeur — calée
     *  contre le menu, pour que le titre ne saute pas d'une section à l'autre. */
    const page = (id: SettingsSectionId, width: string, children: React.ReactNode) => (
        <div className={cn("w-full", width)} data-settings-page={id}>
            <h3 className="mb-6 text-xl font-semibold tracking-tight">{sectionLabel(id)}</h3>
            {children}
        </div>
    );

    return (
        <div className="flex h-full w-full flex-col">
            <WorldPanelHeader
                icon={<Settings className="h-4 w-4 shrink-0 text-muted-foreground" />}
                title={t("tabSettings")}
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
                        className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:block md:p-6", !requested && "hidden")}
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
                        {shown === "general" && page("general", "max-w-xl", (
                            <>
                            <form
                                onSubmit={(e) => e.preventDefault()}
                                className="space-y-6"
                            >
                                {/* -- Nom ------------------------------------ */}
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                <LabelWithHelp help={t("nameHelp")}>
                                                    {t("name")}
                                                </LabelWithHelp>
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder={t("namePlaceholder")}
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

                                {/* -- Description ---------------------------- */}
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                <LabelWithHelp help={t("tagHelp")}>
                                                    {t("description")}
                                                </LabelWithHelp>
                                            </FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    rows={5}
                                                    placeholder={t("descriptionPlaceholder")}
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

                                {/* -- Icône ----------------------------------- */}
                                <FormField
                                    control={form.control}
                                    name="icon_url"
                                    render={() => (
                                        <FormItem>
                                            <FormLabel>
                                                <LabelWithHelp help={t("iconHelp")}>
                                                    {tSettings("worldIcon")}
                                                </LabelWithHelp>
                                            </FormLabel>
                                            <div className="flex items-start gap-3">
                                                {iconUrl ? (
                                                    <div className="flex items-start gap-2">
                                                        <ImagePickerCropField
                                                            aspect={1}
                                                            uploading={uploading === "icon"}
                                                            previewSrc={iconUrl}
                                                            previewClassName="h-12 w-12 shrink-0 rounded-lg"
                                                            changeLabel="Changer"
                                                            onConfirm={onIconConfirm}
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            disabled={uploading === "icon"}
                                                            onClick={() => {
                                                                form.setValue("icon_url", "", { shouldDirty: true });
                                                                void persistField("icon_url", "");
                                                            }}
                                                        >
                                                            {tCommon("remove")}
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="w-full">
                                                        <ImagePickerCropField
                                                            aspect={1}
                                                            uploading={uploading === "icon"}
                                                            onConfirm={onIconConfirm}
                                                        />
                                                    </div>
                                                )}

                                                {/* Sélecteur de couleur désactivé temporairement
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button type="button" variant="secondary" size="sm">
                                                            <span
                                                                className="h-2.5 w-2.5 rounded-full"
                                                                style={{
                                                                    backgroundColor:
                                                                        color || "transparent",
                                                                    boxShadow: color
                                                                        ? "none"
                                                                        : "inset 0 0 0 1px var(--color-border)",
                                                                }}
                                                            />
                                                            {colorPreset?.name ??
                                                                (color ? color : "Couleur")}
                                                            <ChevronDown className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="start" className="w-44">
                                                        {COLOR_PRESETS.map((c) => (
                                                            <DropdownMenuItem
                                                                key={c.value}
                                                                onClick={() => {
                                                                    form.setValue("color", c.value, {
                                                                        shouldDirty: true,
                                                                        shouldValidate: true,
                                                                    });
                                                                    void persistField("color", c.value);
                                                                }}
                                                            >
                                                                <span
                                                                    className="mr-2 h-2.5 w-2.5 rounded-full"
                                                                    style={{ backgroundColor: c.value }}
                                                                />
                                                                {c.name}
                                                            </DropdownMenuItem>
                                                        ))}
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                form.setValue("color", "", {
                                                                    shouldDirty: true,
                                                                    shouldValidate: true,
                                                                });
                                                                void persistField("color", "");
                                                            }}
                                                        >
                                                            <span className="mr-2 h-2.5 w-2.5 rounded-full border border-border" />
                                                            {tSettings("noColor")}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                */}
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* -- Bannière -------------------------------- */}
                                <FormField
                                    control={form.control}
                                    name="banner_url"
                                    render={() => (
                                        <FormItem>
                                            <FormLabel>
                                                <LabelWithHelp help={t("bannerHelp")}>
                                                    {tSettings("banner")}
                                                </LabelWithHelp>
                                            </FormLabel>
                                            <ImagePickerCropField
                                                aspect={16 / 7}
                                                uploading={uploading === "banner"}
                                                previewSrc={bannerUrl || null}
                                                previewClassName="aspect-[16/7] w-full rounded-2xl"
                                                changeLabel={tCommon("dropToReplace")}
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

                                {/* -- Couleurs de la page d'accueil : désactivé temporairement
                                     (voir HomeColorField plus haut) — WorldHome applique
                                     toujours les couleurs par défaut du thème. */}
                            </form>

                            {/* Supprimer le monde reste au propriétaire : `world.settings`
                                permet de régler le monde, pas d'en disposer. */}
                            {membership?.isOwner && (
                                <SettingsSection title={tSettings("menu.dangerZone")} className="mt-10">
                                    <div>
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => void handleDelete()}
                                            disabled={deleting}
                                        >
                                            {deleting ? (
                                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                            ) : null}
                                            {confirmDelete ? t("deleteConfirmShort") : t("delete")}
                                        </Button>
                                    </div>
                                </SettingsSection>
                            )}
                            </>
                        ))}

                        {/* ── Page d'accueil ───────────────────────────── */}
                        {/* Plus large : un éditeur de grille 12 colonnes a besoin de place. */}
                        {shown === "home" && page("home", "max-w-2xl", (
                            <WorldHomeGridSettings world={world} onUpdated={onUpdated} />
                        ))}

                        {/* ── Communauté ───────────────────────────────── */}
                        {shown === "community" && page("community", "max-w-xl", (
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
                            <div className={cn("w-full max-w-3xl", !isFeatureSection(shown) && "hidden")}>
                                <WorldFeaturesTab
                                    // La clé REMONTE les pages quand on change de monde.
                                    key={`features-${world.id}`}
                                    world={world}
                                    form={form}
                                    persistField={persistField}
                                    onUpdated={onUpdated}
                                    section={isFeatureSection(shown) ? shown : null}
                                    onStatusChange={setFeatureStatus}
                                />
                            </div>
                        )}

                        {/* ── Catégories ───────────────────────────────── */}
                        {shown === "categories" && page("categories", "max-w-xl", (
                            <WorldCategoryManager worldId={world.id} canEdit />
                        ))}

                        {/* ── Groupes ──────────────────────────────────── */}
                        {shown === "groups" && page("groups", "max-w-4xl", (
                            <WorldGroupsSettings worldId={world.id} />
                        ))}

                        {/* ── Relations ────────────────────────────────── */}
                        {shown === "relations" && page("relations", "max-w-4xl", (
                            <WorldRelationsSettings worldId={world.id} />
                        ))}

                        {/* ── Rôles ────────────────────────────────────── */}
                        {shown === "roles" && page("roles", "max-w-5xl", (
                            <WorldRolesTab key={`roles-${world.id}`} worldId={world.id} />
                        ))}

                        {/* ── Annonces ─────────────────────────────────── */}
                        {shown === "announcements" && page("announcements", "max-w-3xl", (
                            <WorldAnnouncementsTab
                                key={`announcements-${world.id}`}
                                worldId={world.id}
                                worldName={world.name}
                            />
                        ))}

                        {/* ── Signalements ─────────────────────────────── */}
                        {shown === "reports" && page("reports", "max-w-3xl", (
                            <WorldReportsTab key={`reports-${world.id}`} worldId={world.id} />
                        ))}
                    </div>
                </div>
            </Form>
        </div>
    );
}
