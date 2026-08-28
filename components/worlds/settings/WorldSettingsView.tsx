"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
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
    Camera,
    Globe,
    GlobeLock,
    HelpCircle,
    Loader2,
    Palette,
    Plus,
    Settings,
    ShieldAlert,
    Trash2,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { ImagePickerCropField } from "@/components/ui/image-crop-picker";
import { Switch } from "@/components/ui/switch";
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
    setWorldAgeRestricted,
    setWorldTimeline,
    setWorldAvatarType,
    getWorldTags,
    addWorldTag,
    removeWorldTag,
} from "@/app/actions/worldCatalog";
import { WorldPersonaTemplateSection } from "@/components/worlds/settings/WorldPersonaTemplateSection";
import { WorldCategoryManager } from "@/components/worlds/settings/WorldCategoryManager";
import { WorldRelationsSettings } from "@/components/worlds/settings/WorldRelationsSettings";
import { WorldHomeGridSettings } from "@/components/worlds/settings/WorldHomeGridSettings";
import type { World, WorldTimelineConfig } from "@/types/worlds";
import { clampDaysPerMonth, DEFAULT_DAYS_PER_MONTH, REAL_DAYS_PER_MONTH, REAL_MONTH_NAMES } from "@/lib/worldTimeline";

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

const schema = z.object({
    name: z.string().min(2, "Au moins 2 caractères"),
    description: z
        .string()
        .max(1000, "1000 caractères max")
        .optional()
        .or(z.literal("")),
    icon_url: z.string().url("URL invalide").optional().or(z.literal("")),
    banner_url: z.string().url("URL invalide").optional().or(z.literal("")),
    color: z
        .string()
        .regex(
            /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
            "Couleur hex valide, p.ex. #1f2937"
        )
        .optional()
        .or(z.literal("")),
    visibility: z.enum(["private", "public"]),
    wiki_label: z.string().trim().max(40, "40 caractères max").optional().or(z.literal("")),
});

export type WorldFormValues = z.infer<typeof schema>;

function truthyOrNull<T extends string | undefined | null>(
    v: T
): string | null {
    if (!v) return null;
    const s = String(v).trim();
    return s.length ? s : null;
}

export interface WorldSettingsViewProps {
    world: World;
    onUpdated?: (world: World) => void;
}

function LabelWithHelp({
    children,
    help,
}: {
    children: React.ReactNode;
    help: string;
}) {
    return (
        <span className="flex items-center gap-1.5">
            {children}
            <HelpCircle
                className="h-3.5 w-3.5 text-muted-foreground/60"
                aria-label={help}
            />
        </span>
    );
}

// Personnalisation des couleurs de la page d'accueil désactivée temporairement
// (2026-08-17) — WorldHome.tsx ignore désormais home_body_color/home_panel_color
// et applique toujours les couleurs par défaut du thème. Code conservé
// ci-dessous pour réactivation future.
//
// Sélecteur de couleur pour un fond de page d'accueil — pastille + picker,
// avec un bouton pour revenir à la couleur par défaut du thème (defaultSwatchClassName
// reproduit exactement cette couleur via les mêmes classes Tailwind que l'affichage réel).
// Le glissement dans le picker (canvas + slider de teinte) déclenche onChange
// du HsvColorPicker à chaque pixel survolé — enregistrer à chaque appel
// spammerait le serveur pendant tout le glissement. On bufferise donc la
// couleur choisie localement (draft) et on ne persiste qu'à la fermeture
// du popover (fin du glissement, quelle qu'en soit la cause : clic ailleurs,
// Échap, ré-ouverture).
//
// function HomeColorField({
//     label,
//     help,
//     value,
//     defaultSwatchClassName,
//     defaultHex,
//     resetLabel,
//     onChange,
// }: {
//     label: string;
//     help: string;
//     value: string;
//     /** Classe Tailwind reproduisant la couleur par défaut réellement appliquée (ex: "bg-card"). */
//     defaultSwatchClassName: string;
//     /** Teinte de départ du picker quand aucune couleur n'est encore choisie (juste un point de départ visuel). */
//     defaultHex: string;
//     resetLabel: string;
//     onChange: (hex: string) => void;
// }) {
//     const [open, setOpen] = React.useState(false);
//     const [draft, setDraft] = React.useState(value);
//
//     function handleOpenChange(next: boolean) {
//         if (next) {
//             setDraft(value);
//         } else if (draft !== value) {
//             onChange(draft);
//         }
//         setOpen(next);
//     }
//
//     return (
//         <FormItem>
//             <FormLabel>
//                 <LabelWithHelp help={help}>{label}</LabelWithHelp>
//             </FormLabel>
//             <div className="flex items-center gap-2">
//                 <Popover open={open} onOpenChange={handleOpenChange}>
//                     <PopoverTrigger asChild>
//                         <button
//                             type="button"
//                             className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
//                         >
//                             <span
//                                 className={cn("h-3.5 w-3.5 rounded-full border border-border/60", !value && defaultSwatchClassName)}
//                                 style={value ? { backgroundColor: value } : undefined}
//                             />
//                             {value || resetLabel}
//                         </button>
//                     </PopoverTrigger>
//                     <PopoverContent className="w-[220px] p-3" align="start">
//                         <HsvColorPicker color={draft || defaultHex} onChange={setDraft} presets={[]} />
//                     </PopoverContent>
//                 </Popover>
//                 {value && (
//                     <button
//                         type="button"
//                         onClick={() => {
//                             setDraft("");
//                             onChange("");
//                         }}
//                         className="text-xs text-muted-foreground transition-colors hover:text-foreground"
//                     >
//                         {resetLabel}
//                     </button>
//                 )}
//             </div>
//         </FormItem>
//     );
// }

export function WorldSettingsView({ world, onUpdated }: WorldSettingsViewProps) {
  const tCommon = useTranslations("common");
  const t = useTranslations("worlds");
    const supabase = createClient();
    const router = useRouter();
    const { public_worlds, world_timeline } = useFeatureFlags();
    const [uploading, setUploading] = React.useState<null | "icon" | "banner">(null);
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);

    const [enableInventory, setEnableInventory] = React.useState(world.enable_inventory !== false);
    const [enableSkills, setEnableSkills] = React.useState(world.enable_skills !== false);
    const [restrictInventory, setRestrictInventory] = React.useState(!!world.restrict_inventory);
    const [restrictSkills, setRestrictSkills] = React.useState(!!world.restrict_skills);
    const [pendingRestriction, setPendingRestriction] = React.useState<"inventory" | "skills" | null>(null);
    const [togglingRestriction, setTogglingRestriction] = React.useState(false);
    const [togglingEnable, setTogglingEnable] = React.useState(false);

    const [enableFaceclaims, setEnableFaceclaims] = React.useState(world.enable_faceclaims !== false);
    const [togglingFaceclaims, setTogglingFaceclaims] = React.useState(false);

    const [ageRestricted, setAgeRestricted] = React.useState(world.is_age_restricted === true);
    const [togglingAgeRestricted, setTogglingAgeRestricted] = React.useState(false);

    const [allowsRealAvatars, setAllowsRealAvatars] = React.useState(world.allows_real_avatars === true);
    const [allowsIllustratedAvatars, setAllowsIllustratedAvatars] = React.useState(world.allows_illustrated_avatars === true);
    const [togglingAvatarType, setTogglingAvatarType] = React.useState(false);

    // homeBodyColor/homePanelColor : voir HomeColorField (désactivé temporairement) plus haut.

    const [tags, setTags] = React.useState<string[]>([]);
    const [newTag, setNewTag] = React.useState("");
    const [savingTag, setSavingTag] = React.useState(false);
    const [existingTags, setExistingTags] = React.useState<string[]>([]);

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

    async function handleEnableToggle(field: "inventory" | "skills", enabled: boolean) {
        setTogglingEnable(true);
        const res = await setWorldFeature(world.id, `enable_${field}`, enabled);
        setTogglingEnable(false);
        if (!res.ok) { toast.error(res.error); return; }
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
        if (!res.ok) { toast.error(res.error); return; }
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
        if (!res.ok) { toast.error(res.error); return; }
        if (field === "inventory") setRestrictInventory(true);
        else setRestrictSkills(true);
        onUpdated?.({ ...world, [`restrict_${field}`]: true } as World);
    }

    async function handleFaceclaimsToggle(enabled: boolean) {
        setTogglingFaceclaims(true);
        const res = await setWorldFaceclaims(world.id, enabled);
        setTogglingFaceclaims(false);
        if (!res.ok) { toast.error(res.error); return; }
        setEnableFaceclaims(enabled);
        onUpdated?.({ ...world, enable_faceclaims: enabled } as World);
    }

    async function handleAgeRestrictedToggle(enabled: boolean) {
        setTogglingAgeRestricted(true);
        const res = await setWorldAgeRestricted(world.id, enabled);
        setTogglingAgeRestricted(false);
        if (!res.ok) { toast.error(res.error); return; }
        setAgeRestricted(enabled);
        onUpdated?.({ ...world, is_age_restricted: enabled } as World);
    }

    async function handleAvatarTypeToggle(
        field: "allows_real_avatars" | "allows_illustrated_avatars",
        enabled: boolean,
    ) {
        setTogglingAvatarType(true);
        const res = await setWorldAvatarType(world.id, field, enabled);
        setTogglingAvatarType(false);
        if (!res.ok) { toast.error(res.error); return; }
        if (field === "allows_real_avatars") setAllowsRealAvatars(enabled);
        else setAllowsIllustratedAvatars(enabled);
        onUpdated?.({ ...world, [field]: enabled } as World);
    }

    async function handleAddTag(tagOverride?: string) {
        const value = (tagOverride ?? newTag).trim();
        if (!value) return;
        setSavingTag(true);
        const res = await addWorldTag(world.id, value);
        setSavingTag(false);
        if (!res.ok) { toast.error(res.error); return; }
        setTags((prev) => (prev.includes(res.tag) ? prev : [...prev, res.tag]));
        setExistingTags((prev) => (prev.includes(res.tag) ? prev : [...prev, res.tag]));
        setNewTag("");
    }

    const tagSuggestions = React.useMemo(() => {
        const query = newTag.trim().toLowerCase();
        if (!query) return [];
        return existingTags
            .filter((t) => t !== query && t.includes(query) && !tags.includes(t))
            .slice(0, 6);
    }, [newTag, existingTags, tags]);

    // existingTags est déjà trié par popularité (get_public_world_tags) — les 6
    // premiers non encore ajoutés à ce monde suffisent.
    const popularTags = React.useMemo(
        () => existingTags.filter((t) => !tags.includes(t)).slice(0, 6),
        [existingTags, tags],
    );

    async function handleRemoveTag(tag: string) {
        setTags((prev) => prev.filter((t) => t !== tag));
        const res = await removeWorldTag(world.id, tag);
        if (!res.ok) {
            toast.error(res.error);
            setTags((prev) => [...prev, tag]);
        }
    }

    async function handleTimelineToggle(enabled: boolean) {
        setTogglingTimeline(true);
        const res = await setWorldTimeline(world.id, enabled, enabled ? timelineConfig : null);
        setTogglingTimeline(false);
        if (!res.ok) { toast.error(res.error); return; }
        setTimelineEnabled(enabled);
        if (!enabled) setTimelineConfig(defaultConfig);
        onUpdated?.({ ...world, timeline_enabled: enabled, timeline_config: enabled ? timelineConfig : null } as World);
    }

    async function persistTimelineConfig(patch: Partial<WorldTimelineConfig>) {
        const next = { ...timelineConfig, ...patch };
        setTimelineConfig(next);
        const res = await setWorldTimeline(world.id, timelineEnabled, next);
        if (!res.ok) toast.error(res.error);
        else onUpdated?.({ ...world, timeline_config: next } as World);
    }

    // Réinitialise les valeurs si on change de monde tout en restant sur cette vue.
    React.useEffect(() => {
        setConfirmDelete(false);
        setEnableInventory(world.enable_inventory !== false);
        setEnableSkills(world.enable_skills !== false);
        setRestrictInventory(!!world.restrict_inventory);
        setRestrictSkills(!!world.restrict_skills);
        setEnableFaceclaims(world.enable_faceclaims !== false);
        setAgeRestricted(world.is_age_restricted === true);
        setAllowsRealAvatars(world.allows_real_avatars === true);
        setAllowsIllustratedAvatars(world.allows_illustrated_avatars === true);
        setTimelineEnabled(!!world.timeline_enabled);
        setTimelineConfig(world.timeline_config ?? defaultConfig);
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

    React.useEffect(() => {
        let cancelled = false;
        setTags([]);
        void getWorldTags(world.id).then((res) => {
            if (cancelled) return;
            if (res.ok) setTags(res.tags.map((t) => t.tag));
        });
        return () => { cancelled = true; };
    }, [world?.id]);

    // Tags déjà utilisés ailleurs (mondes publics) — sert de source pour les
    // suggestions affichées pendant la saisie, indépendant du monde courant.
    React.useEffect(() => {
        let cancelled = false;
        void supabase
            .rpc("get_public_world_tags")
            .then(({ data }: { data: { tag: string; world_count: number }[] | null }) => {
                if (cancelled) return;
                setExistingTags((data ?? []).map((t) => t.tag));
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function uploadToWorlds(file: File, kind: "icon" | "banner") {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Non connecté.");
        if (file.size > 5 * 1024 * 1024)
            throw new Error("Fichier trop volumineux (max 5 Mo).");

        const converted = await toWebP(file);
        const path = `user-${user.id}/world-${world.id}/${kind}-${Date.now()}.webp`;

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
            toast.error(e instanceof Error ? e.message : "Téléversement impossible.");
        } finally {
            setUploading(null);
        }
    }

    async function onIconConfirm(blob: Blob) {
        await uploadFile(new File([blob], "icon.jpg", { type: blob.type || "image/jpeg" }), "icon");
    }

    async function onBannerConfirm(blob: Blob) {
        await uploadFile(new File([blob], "banner.jpg", { type: blob.type || "image/jpeg" }), "banner");
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
            toast.error(e instanceof Error ? e.message : "Enregistrement impossible.");
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
            toast.error(e instanceof Error ? e.message : "Suppression impossible.");
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
                <Tabs defaultValue="appearance" className="flex min-h-0 flex-1 flex-col">
                    <div className="shrink-0 shadow-[inset_0_-1px_0_0_var(--color-border-soft)]">
                        {/* ScrollArea plutôt qu'un simple `overflow-x-auto` : la
                            barre de défilement native (toujours visible sur
                            certains systèmes/navigateurs) est remplacée par le
                            style fin de l'appli, et n'apparaît que si les
                            onglets débordent réellement du conteneur — utile
                            sur un écran étroit avec les 6 onglets. */}
                        <ScrollArea className="w-full">
                            <TabsPrimitive.List className="flex w-max items-center gap-6 px-4">
                                <TabsPrimitive.Trigger value="appearance" className={SETTINGS_TAB_TRIGGER_CLASS}>Apparence</TabsPrimitive.Trigger>
                                <TabsPrimitive.Trigger value="categories" className={SETTINGS_TAB_TRIGGER_CLASS}>{t("tabCategories")}</TabsPrimitive.Trigger>
                                <TabsPrimitive.Trigger value="home" className={SETTINGS_TAB_TRIGGER_CLASS}>Page d&apos;accueil</TabsPrimitive.Trigger>
                                <TabsPrimitive.Trigger value="features" className={SETTINGS_TAB_TRIGGER_CLASS}>Fonctions</TabsPrimitive.Trigger>
                                <TabsPrimitive.Trigger value="relations" className={SETTINGS_TAB_TRIGGER_CLASS}>Relations</TabsPrimitive.Trigger>
                                {public_worlds && (
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
                                                <LabelWithHelp help="Le nom affiché partout dans l’app">
                                                    Nom du monde
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
                                                <LabelWithHelp help="Visible sur la carte du monde">
                                                    Description
                                                </LabelWithHelp>
                                            </FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    rows={5}
                                                    placeholder={t("descriptionPlaceholder")}
                                                    className="rounded-2xl"
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
                                                <LabelWithHelp help="Affichée dans la sidebar et sur la carte du monde">
                                                    Icône du monde
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
                                                            Retirer
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
                                                            Aucune
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
                                                <LabelWithHelp help="Image large affichée en haut de la page du monde">
                                                    Bannière
                                                </LabelWithHelp>
                                            </FormLabel>
                                            <ImagePickerCropField
                                                aspect={16 / 7}
                                                uploading={uploading === "banner"}
                                                previewSrc={bannerUrl || null}
                                                previewClassName="aspect-[16/7] w-full rounded-2xl"
                                                changeLabel="Cliquer ou déposer pour remplacer"
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
                                                    Retirer la bannière
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

                                {/* -- Wiki ---------------------------------- */}
                                <div className="space-y-3 pt-2">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wiki</p>
                                    <FormField
                                        control={form.control}
                                        name="wiki_label"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    <LabelWithHelp help="Renomme le lien du wiki dans la sidebar du monde">
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

                                {/* -- Sécurité ---------------------------------- */}
                                <div className="space-y-5 pt-2">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("tabSecurity")}</p>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-0.5">
                                            <p className="flex items-center gap-1.5 text-sm font-medium">
                                                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                                Monde réservé aux 18 ans et plus
                                            </p>
                                            <p className="text-xs text-muted-foreground leading-snug">
                                                Les nouveaux membres devront confirmer avoir 18 ans ou plus avant de pouvoir rejoindre ce monde.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={ageRestricted}
                                            disabled={togglingAgeRestricted}
                                            onCheckedChange={v => void handleAgeRestrictedToggle(v)}
                                            className="shrink-0 mt-0.5"
                                        />
                                    </div>
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

                        {/* ── Relations ────────────────────────────────── */}
                        <TabsContent value="relations" className="mt-0">
                            <div className="mx-auto max-w-xl">
                                <WorldRelationsSettings worldId={world.id} />
                            </div>
                        </TabsContent>

                        {/* ── Communauté ───────────────────────────────── */}
                        {public_worlds && (
                            <TabsContent value="community" className="mt-0">
                                <div className="mx-auto max-w-xl space-y-6">
                                    {/* -- Visibilité ----------------------------- */}
                                    <FormField
                                        control={form.control}
                                        name="visibility"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    <LabelWithHelp help="Un monde public est accessible à tous les membres de la plateforme">
                                                        Visibilité
                                                    </LabelWithHelp>
                                                </FormLabel>
                                                <FormControl>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                field.onChange("private");
                                                                void persistField("visibility", "private");
                                                            }}
                                                            className={cn(
                                                                "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                                                                field.value === "private"
                                                                    ? "border-primary bg-primary/10 text-primary"
                                                                    : "border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                                                            )}
                                                        >
                                                            <GlobeLock className="h-4 w-4 shrink-0" />
                                                            Privé
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                field.onChange("public");
                                                                void persistField("visibility", "public");
                                                            }}
                                                            className={cn(
                                                                "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                                                                field.value === "public"
                                                                    ? "border-primary bg-primary/10 text-primary"
                                                                    : "border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                                                            )}
                                                        >
                                                            <Globe className="h-4 w-4 shrink-0" />
                                                            Public
                                                        </button>
                                                    </div>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* -- Tags -------------------------------- */}
                                    <div className="space-y-3">
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium">Tags</p>
                                            <p className="text-xs text-muted-foreground leading-snug">
                                                Aident les autres joueurs à trouver ce monde dans l&apos;Explorateur.
                                            </p>
                                        </div>
                                        {tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {tags.map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="inline-flex items-center gap-1 rounded-full border border-border-soft bg-muted/40 px-2.5 py-1 text-xs"
                                                    >
                                                        {tag}
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleRemoveTag(tag)}
                                                            className="text-muted-foreground hover:text-destructive transition-colors"
                                                            aria-label={`Retirer le tag ${tag}`}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {tags.length < 10 && !newTag.trim() && popularTags.length > 0 && (
                                            <div className="space-y-1">
                                                <p className="text-[11px] font-medium text-muted-foreground">Tags populaires</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {popularTags.map((tag) => (
                                                        <button
                                                            key={tag}
                                                            type="button"
                                                            disabled={savingTag}
                                                            onClick={() => void handleAddTag(tag)}
                                                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-soft px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                                                        >
                                                            <Plus className="h-3 w-3" />
                                                            {tag}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {tags.length < 10 && (
                                            <div className="space-y-1.5">
                                                <div className="flex gap-2">
                                                    <Input
                                                        value={newTag}
                                                        placeholder={t("addTagPlaceholder")}
                                                        className="h-8 text-sm"
                                                        maxLength={24}
                                                        disabled={savingTag}
                                                        onChange={(e) => setNewTag(e.target.value.replace(/[^\p{L}\p{N}]/gu, ""))}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" || e.key === " " || e.key === ",") {
                                                                e.preventDefault();
                                                                void handleAddTag();
                                                            }
                                                        }}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="sm"
                                                        disabled={!newTag.trim() || savingTag}
                                                        onClick={() => void handleAddTag()}
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                                {tagSuggestions.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {tagSuggestions.map((tag) => (
                                                            <button
                                                                key={tag}
                                                                type="button"
                                                                disabled={savingTag}
                                                                onClick={() => void handleAddTag(tag)}
                                                                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-soft px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                                                            >
                                                                <Plus className="h-3 w-3" />
                                                                {tag}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {tags.length >= 10 && (
                                            <p className="text-[11px] text-muted-foreground">Maximum 10 tags.</p>
                                        )}
                                    </div>

                                    {/* -- Type d'avatars ----------------------- */}
                                    <div className="space-y-3">
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium">{t("acceptedAvatarTypes")}</p>
                                            <p className="text-xs text-muted-foreground leading-snug">
                                                Indique aux visiteurs le style d&apos;avatars utilisé dans ce monde.
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                disabled={togglingAvatarType}
                                                onClick={() => void handleAvatarTypeToggle("allows_real_avatars", !allowsRealAvatars)}
                                                aria-pressed={allowsRealAvatars}
                                                className={cn(
                                                    "flex flex-1 flex-col items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors disabled:opacity-60",
                                                    allowsRealAvatars
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                                                )}
                                            >
                                                <Camera className="h-4 w-4 shrink-0" />
                                                Avatars réels
                                            </button>
                                            <button
                                                type="button"
                                                disabled={togglingAvatarType}
                                                onClick={() => void handleAvatarTypeToggle("allows_illustrated_avatars", !allowsIllustratedAvatars)}
                                                aria-pressed={allowsIllustratedAvatars}
                                                className={cn(
                                                    "flex flex-1 flex-col items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors disabled:opacity-60",
                                                    allowsIllustratedAvatars
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                                                )}
                                            >
                                                <Palette className="h-4 w-4 shrink-0" />
                                                Avatars illustrés
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>
                        )}
                    </div>
                </Tabs>
            </Form>

            {/* Confirmation purge */}
            <AlertDialog open={!!pendingRestriction} onOpenChange={open => { if (!open) setPendingRestriction(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("enableRestrictionTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cette action effacera immédiatement tous les {pendingRestriction === "inventory" ? "objets d'inventaire" : "compétences"} des personas de ce monde. Cette opération est irréversible.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void confirmRestriction()}>
                            Activer et purger
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
                    {confirmDelete
                        ? "Confirmer la suppression ?"
                        : "Supprimer le monde"}
                </Button>
            </div>
        </div>
    );
}
