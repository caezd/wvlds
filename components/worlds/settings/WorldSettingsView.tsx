"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
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
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
// Popover + HsvColorPicker : utilisés par HomeColorField, désactivé
// temporairement (voir plus bas) — imports retirés en attendant.
import {
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
import { WorldHomeGridSettings } from "@/components/worlds/settings/WorldHomeGridSettings";
// Les onglets « Fonctions » et « Communauté » portent leur propre état et
// leurs propres appels serveur — voir l'en-tête de chacun.
import { WorldFeaturesTab } from "./WorldFeaturesTab";
import { WorldCommunityTab } from "./WorldCommunityTab";
import type { World } from "@/types/worlds";

/**
 * Vue plein-écran des paramètres d'un « monde », organisée en onglets
 * (Apparence / Catégories / Fonctions). Remplace l'ancien WorldEditDialog
 * (Sheet) — la visibilité est pilotée par le parent via le système `?view=`.
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

/** Onglets en soulignement plutôt qu'en pastille pleine (style shadcn par
 *  défaut) — remplace TabsList/TabsTrigger par les primitives Radix
 *  directement pour ce seul usage, plus lisible à 6 onglets et mieux espacé.
 *
 *  Le trait actif est une ombre `inset`, pas un `border-b` : une ombre reste
 *  DANS la boîte de l'élément (jamais comptée dans le « scrollable overflow »
 *  qu'utilise ScrollArea pour décider d'afficher sa scrollbar), contrairement
 *  à un `border`, une marge négative ou un `transform` — les trois essais
 *  précédents ajoutaient chacun 1px à la hauteur mesurée par ScrollArea et
 *  faisaient apparaître une scrollbar verticale parasite plus haut dans
 *  l'arbre.
 *
 *  Le conteneur parent trace lui aussi sa ligne de base en `shadow-[inset…]`
 *  plutôt qu'en `border-b` (voir plus bas) : un vrai `border` occupe sa
 *  propre tranche de boîte, 1px EN DEHORS de la boîte du trigger — même
 *  parfaitement alignés, les deux traits restent deux éléments distincts,
 *  perceptiblement séparés par une micro-teinte différente. Deux ombres
 *  posées sur le MÊME bord bas, elles, se superposent au pixel près (le
 *  trigger, enfant, se peint après son parent) : celle du trigger actif
 *  recouvre entièrement celle du conteneur à cet endroit, comme un seul
 *  trait continu. */
const SETTINGS_TAB_TRIGGER_CLASS =
    "relative shrink-0 px-0.5 py-3 text-sm font-medium text-muted-foreground whitespace-nowrap transition-colors hover:text-foreground data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-2px_0_0_var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

import { LabelWithHelp } from "./LabelWithHelp";
import { WorldRolesTab } from "./WorldRolesTab";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";
import {
  buildWorldSettingsSchema,
  truthyOrNull,
  type WorldFormValues,
} from "./worldSettingsSchema";

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
    const { public_worlds } = useFeatureFlags();
    // Chaque onglet répond à une permission : un membre qui n'a que
    // `roles.manage` voit l'onglet Rôles et rien d'autre.
    const { can, membership } = useWorldMembership();
    const tabs = {
        appearance: can("world.settings"),
        categories: can("world.settings") || can("categories.manage"),
        home: can("world.settings"),
        features: can("world.settings"),
        relations: can("world.settings") || can("relations.manage"),
        roles: can("world.settings") || can("roles.manage"),
        community: public_worlds && can("world.settings"),
    };
    const firstTab = (Object.keys(tabs) as (keyof typeof tabs)[]).find((k) => tabs[k]) ?? "appearance";
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
            .upload(path, converted, { upsert: true, contentType: converted.type });
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

    return (
        <div className="flex h-full w-full flex-col">
            <WorldPanelHeader
                icon={<Settings className="h-4 w-4 shrink-0 text-muted-foreground" />}
                title={t("tabSettings")}
            />

            <Form {...form}>
                <Tabs defaultValue={firstTab} className="flex min-h-0 flex-1 flex-col">
                    <div className="shrink-0 shadow-[inset_0_-1px_0_0_var(--color-border-soft)]">
                        {/* ScrollArea plutôt qu'un simple `overflow-x-auto` : la
                            barre de défilement native (toujours visible sur
                            certains systèmes/navigateurs) est remplacée par le
                            style fin de l'appli, et n'apparaît que si les
                            onglets débordent réellement du conteneur — utile
                            sur un écran étroit avec les 6 onglets. */}
                        <ScrollArea className="w-full">
                            <TabsPrimitive.List className="flex w-max items-center gap-6 px-4">
                                {tabs.appearance && (
                                    <TabsPrimitive.Trigger value="appearance" className={SETTINGS_TAB_TRIGGER_CLASS}>{t("tabAppearance")}</TabsPrimitive.Trigger>
                                )}
                                {tabs.categories && (
                                    <TabsPrimitive.Trigger value="categories" className={SETTINGS_TAB_TRIGGER_CLASS}>{t("tabCategories")}</TabsPrimitive.Trigger>
                                )}
                                {tabs.home && (
                                    <TabsPrimitive.Trigger value="home" className={SETTINGS_TAB_TRIGGER_CLASS}>{t("tabHome")}</TabsPrimitive.Trigger>
                                )}
                                {tabs.features && (
                                    <TabsPrimitive.Trigger value="features" className={SETTINGS_TAB_TRIGGER_CLASS}>{t("tabFeatures")}</TabsPrimitive.Trigger>
                                )}
                                {tabs.relations && (
                                    <TabsPrimitive.Trigger value="relations" className={SETTINGS_TAB_TRIGGER_CLASS}>{t("tabRelations")}</TabsPrimitive.Trigger>
                                )}
                                {tabs.roles && (
                                    <TabsPrimitive.Trigger value="roles" className={SETTINGS_TAB_TRIGGER_CLASS}>{t("tabRoles")}</TabsPrimitive.Trigger>
                                )}
                                {tabs.community && (
                                    <TabsPrimitive.Trigger value="community" className={SETTINGS_TAB_TRIGGER_CLASS}>{t("tabCommunity")}</TabsPrimitive.Trigger>
                                )}
                            </TabsPrimitive.List>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {/* ── Apparence ────────────────────────────────── */}
                        <TabsContent value="appearance" className="mt-0">
                            <form
                                onSubmit={(e) => e.preventDefault()}
                                className="mx-auto max-w-xl space-y-6"
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
                        </TabsContent>

                        {/* ── Catégories ───────────────────────────────── */}
                        <TabsContent value="categories" className="mt-0">
                            <div className="mx-auto max-w-xl">
                                <WorldCategoryManager worldId={world.id} canEdit />
                            </div>
                        </TabsContent>

                        {/* ── Page d'accueil ───────────────────────────── */}
                        {/* max-w-2xl plutôt que max-w-xl (comme les autres onglets) :
                            un éditeur de grille 12 colonnes a besoin de plus de place. */}
                        <TabsContent value="home" className="mt-0">
                            <div className="mx-auto max-w-2xl">
                                <WorldHomeGridSettings world={world} onUpdated={onUpdated} />
                            </div>
                        </TabsContent>

                        {/* ── Fonctions ────────────────────────────────── */}
                        <WorldFeaturesTab
                            // La clé sert à REMONTER l'onglet quand on change de
                            // monde. Elle doit rester unique entre frères : les
                            // deux onglets partageaient `world.id`, ce que React
                            // signale par « two children with the same key », et
                            // qui l'autorise à confondre ou omettre l'un des deux.
                            key={`features-${world.id}`}
                            world={world}
                            form={form}
                            persistField={persistField}
                            onUpdated={onUpdated}
                        />

                        {/* ── Relations ────────────────────────────────── */}
                        <TabsContent value="relations" className="mt-0">
                            <div className="mx-auto max-w-xl">
                                <WorldRelationsSettings worldId={world.id} />
                            </div>
                        </TabsContent>

                        {/* ── Rôles ────────────────────────────────────── */}
                        {tabs.roles && (
                            <TabsContent value="roles" className="mt-0">
                                <WorldRolesTab key={`roles-${world.id}`} worldId={world.id} />
                            </TabsContent>
                        )}

                        {/* ── Communauté ───────────────────────────────── */}
                        {tabs.community && (
                            <WorldCommunityTab
                                key={`community-${world.id}`}
                                world={world}
                                form={form}
                                persistField={persistField}
                                onUpdated={onUpdated}
                            />
                        )}
                    </div>
                </Tabs>
            </Form>


            {/* Supprimer le monde reste au propriétaire : `world.settings`
                permet de régler le monde, pas d'en disposer. */}
            {membership?.isOwner && (
            <div className="flex shrink-0 justify-start border-t border-border-soft px-4 py-3">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    className="inline-flex text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                    {deleting ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : null}
                    {confirmDelete ? t("deleteConfirmShort") : t("delete")}
                </Button>
            </div>
            )}
        </div>
    );
}
