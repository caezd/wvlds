"use client";

import * as React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toWebP } from "@/lib/imageUtils";

import {
    Sheet,
    SheetContent,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
    ChevronDown,
    FileUp,
    Globe,
    GlobeLock,
    HelpCircle,
    Loader2,
    Image as ImageIcon,
    Plus,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { ImageCropPicker, getCroppedImg } from "@/components/ui/image-crop-picker";
import type { Area } from "react-easy-crop";
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
import { setWorldFeature, setWorldRestriction, setWorldTimeline } from "@/app/actions/worldCatalog";
import { WorldPersonaTemplateSection } from "@/components/worlds/WorldPersonaTemplateSection";
import type { WorldTimelineConfig } from "@/types/worlds";

/**
 * Edit dialog pour un « monde » — layout "Project Settings" du kit
 * Constructor X : icône + couleur en pills, champs nom/description,
 * zone drag & drop pour la bannière, suppression en bas.
 */

export type World = {
    id: string;
    name: string;
    description?: string | null;
    icon_url?: string | null;
    banner_url?: string | null;
    color?: string | null; // hex (#RRGGBB)
    visibility?: string | null;
    enable_inventory?: boolean | null;
    enable_skills?: boolean | null;
    restrict_inventory?: boolean | null;
    restrict_skills?: boolean | null;
    timeline_enabled?: boolean | null;
    timeline_config?: WorldTimelineConfig | null;
};

const COLOR_PRESETS = [
    { name: "Bleu", value: "#3b82f6" },
    { name: "Vert", value: "#22c55e" },
    { name: "Orange", value: "#f97316" },
    { name: "Violet", value: "#8b5cf6" },
    { name: "Rouge", value: "#ef4444" },
    { name: "Rose", value: "#f94b5f" },
];

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
});

export type WorldFormValues = z.infer<typeof schema>;

function truthyOrNull<T extends string | undefined | null>(
    v: T
): string | null {
    if (!v) return null;
    const s = String(v).trim();
    return s.length ? s : null;
}

export interface WorldEditDialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    world: World; // initial values
    onSave?: (values: WorldFormValues) => Promise<World | void> | World | void;
    onUpdated?: (world: World) => void;
    trigger?: React.ReactNode;
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

export default function WorldEditDialog({
    open,
    onOpenChange,
    world,
    onUpdated,
    trigger,
}: WorldEditDialogProps) {
    const supabase = createClient();
    const router = useRouter();
    const { public_worlds, world_timeline } = useFeatureFlags();
    const [uploading, setUploading] = React.useState<null | "icon" | "banner">(null);
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [bannerCropSrc, setBannerCropSrc] = React.useState<string | null>(null);

    const [enableInventory, setEnableInventory] = React.useState(world.enable_inventory !== false);
    const [enableSkills, setEnableSkills] = React.useState(world.enable_skills !== false);
    const [restrictInventory, setRestrictInventory] = React.useState(!!world.restrict_inventory);
    const [restrictSkills, setRestrictSkills] = React.useState(!!world.restrict_skills);
    const [pendingRestriction, setPendingRestriction] = React.useState<"inventory" | "skills" | null>(null);
    const [togglingRestriction, setTogglingRestriction] = React.useState(false);
    const [togglingEnable, setTogglingEnable] = React.useState(false);

    const defaultConfig: WorldTimelineConfig = {
        year_label: "an",
        era_name: null,
        month_names: [],
        current_year: 1,
        current_month: null,
    };
    const [timelineEnabled, setTimelineEnabled] = React.useState(!!world.timeline_enabled);
    const [timelineConfig, setTimelineConfig] = React.useState<WorldTimelineConfig>(
        world.timeline_config ?? defaultConfig,
    );
    const [togglingTimeline, setTogglingTimeline] = React.useState(false);
    const [newMonthName, setNewMonthName] = React.useState("");

    const iconInputRef = React.useRef<HTMLInputElement | null>(null);
    const bannerInputRef = React.useRef<HTMLInputElement | null>(null);

    // Fallback non-contrôlé si `open`/`onOpenChange` ne sont pas fournis
    const [localOpen, setLocalOpen] = React.useState(false);
    const mergedOpen = open ?? localOpen;
    const setOpen = onOpenChange ?? setLocalOpen;

    const form = useForm<WorldFormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: world.name ?? "",
            description: world.description ?? "",
            icon_url: world.icon_url ?? "",
            banner_url: world.banner_url ?? "",
            color: world.color ?? "",
            visibility: (world.visibility === "public" ? "public" : "private") as "private" | "public",
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

    // Réinjecte les valeurs quand le dialog (re)s’ouvre sur ce monde
    React.useEffect(() => {
        if (mergedOpen) {
            setConfirmDelete(false);
            setEnableInventory(world.enable_inventory !== false);
            setEnableSkills(world.enable_skills !== false);
            setRestrictInventory(!!world.restrict_inventory);
            setRestrictSkills(!!world.restrict_skills);
            setTimelineEnabled(!!world.timeline_enabled);
            setTimelineConfig(world.timeline_config ?? defaultConfig);
            form.reset({
                name: world.name ?? "",
                description: world.description ?? "",
                icon_url: world.icon_url ?? "",
                banner_url: world.banner_url ?? "",
                color: world.color ?? "",
                visibility: (world.visibility === "public" ? "public" : "private") as "private" | "public",
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mergedOpen, world?.id]);

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
            // Sauvegarde immédiate en base (comme PersonaEditSheet)
            const { error } = await supabase
                .from("worlds")
                .update({ [field]: url })
                .eq("id", world.id);
            if (error) throw error;
            onUpdated?.({ ...world, [field]: url } as World);
            toast.success("Image enregistrée.");
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Téléversement impossible.");
        } finally {
            setUploading(null);
        }
    }

    function handleFile(file: File | undefined, kind: "icon" | "banner") {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            toast.error("Seules les images sont acceptées.");
            return;
        }
        if (kind === "banner") {
            setBannerCropSrc(URL.createObjectURL(file));
        } else {
            void uploadFile(file, "icon");
        }
    }

    async function onBannerCropConfirm(pixels: Area) {
        if (!bannerCropSrc) return;
        try {
            const blob = await getCroppedImg(bannerCropSrc, pixels);
            URL.revokeObjectURL(bannerCropSrc);
            setBannerCropSrc(null);
            await uploadFile(new File([blob], "banner.jpg", { type: "image/jpeg" }), "banner");
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Erreur lors du recadrage.");
        }
    }

    function cancelBannerCrop() {
        if (bannerCropSrc) URL.revokeObjectURL(bannerCropSrc);
        setBannerCropSrc(null);
    }

    // Persiste un champ immédiatement (sauvegarde temps réel, sans bouton).
    async function persistField(
        field: "name" | "description" | "icon_url" | "banner_url" | "color" | "visibility",
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

            toast.success("Monde supprimé.");
            setOpen(false);
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
    const color = form.watch("color");
    const colorPreset = COLOR_PRESETS.find((c) => c.value === color);

    return (
        <Sheet open={mergedOpen} onOpenChange={setOpen}>
            {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
                <SheetHeader className="border-b border-border-soft px-6 py-4">
                    <SheetTitle>Paramètres</SheetTitle>
                </SheetHeader>

                <Form {...form}>
                    <form
                        onSubmit={(e) => e.preventDefault()}
                        className="flex-1 space-y-6 overflow-y-auto p-6"
                    >
                        {/* -- Icône + couleur ------------------------ */}
                        <div className="flex items-center gap-3">
                            <span
                                className={cn(
                                    "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full",
                                    !iconUrl && "bg-card-400"
                                )}
                                style={{
                                    backgroundColor: !iconUrl
                                        ? color || undefined
                                        : undefined,
                                }}
                            >
                                {uploading === "icon" ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : iconUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={iconUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <ImageIcon className="h-5 w-5 text-white/70" />
                                )}
                            </span>

                            <input
                                ref={iconInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) =>
                                    void handleFile(e.target.files?.[0], "icon")
                                }
                            />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button type="button" variant="secondary" size="sm">
                                        Changer l’icône
                                        <ChevronDown className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem
                                        onClick={() => iconInputRef.current?.click()}
                                    >
                                        Téléverser une image…
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        disabled={!iconUrl}
                                        onClick={() => {
                                            form.setValue("icon_url", "", {
                                                shouldDirty: true,
                                            });
                                            void persistField("icon_url", "");
                                        }}
                                    >
                                        Retirer l’icône
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

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
                        </div>

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
                                            placeholder="Ex. Monde de Veldis"
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
                                            placeholder="Brève description du monde…"
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

                        {/* -- Visibilité ----------------------------- */}
                        {public_worlds && (
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
                        )}

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
                                    <input
                                        ref={bannerInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            handleFile(e.target.files?.[0], "banner");
                                            e.target.value = "";
                                        }}
                                    />

                                    {bannerCropSrc ? (
                                        <ImageCropPicker
                                            src={bannerCropSrc}
                                            aspect={16 / 7}
                                            uploading={uploading === "banner"}
                                            onConfirm={onBannerCropConfirm}
                                            onCancel={cancelBannerCrop}
                                        />
                                    ) : (
                                        <>
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => bannerInputRef.current?.click()}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ")
                                                        bannerInputRef.current?.click();
                                                }}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    handleFile(e.dataTransfer.files?.[0], "banner");
                                                }}
                                                className={cn(
                                                    "relative grid min-h-36 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-border transition-colors hover:border-muted-foreground/40",
                                                    bannerUrl && "border-solid"
                                                )}
                                            >
                                                {bannerUrl ? (
                                                    <>
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={bannerUrl}
                                                            alt="Bannière"
                                                            className="absolute inset-0 h-full w-full object-cover"
                                                        />
                                                        <div className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity hover:opacity-100">
                                                            <span className="text-xs font-medium text-white">
                                                                Cliquer ou déposer pour remplacer
                                                            </span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                                                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card-400">
                                                            {uploading === "banner" ? (
                                                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                            ) : (
                                                                <FileUp className="h-4 w-4 text-muted-foreground" />
                                                            )}
                                                        </span>
                                                        <p className="text-xs font-medium">
                                                            Glisser-déposer ou{" "}
                                                            <span className="text-blue-400">parcourir</span>
                                                        </p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            Taille max 5 Mo
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
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
                                        </>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* -- Catalogue -------------------------------- */}
                        <div className="space-y-5 pt-2">
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
                                            <p className="text-sm font-medium">Restreindre au catalogue du monde</p>
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
                                        <p className="text-sm font-medium">Compétences</p>
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
                                            <p className="text-sm font-medium">Restreindre au catalogue du monde</p>
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
                                        <p className="text-sm font-medium">Activer la timeline</p>
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
                                                <p className="text-xs font-medium text-muted-foreground">Libellé d&apos;année</p>
                                                <Input
                                                    value={timelineConfig.year_label}
                                                    placeholder="an"
                                                    className="h-8 text-sm"
                                                    onChange={e => setTimelineConfig(c => ({ ...c, year_label: e.target.value }))}
                                                    onBlur={e => void persistTimelineConfig({ year_label: e.target.value || "an" })}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <p className="text-xs font-medium text-muted-foreground">Ère / suffixe</p>
                                                <Input
                                                    value={timelineConfig.era_name ?? ""}
                                                    placeholder="des Cendres"
                                                    className="h-8 text-sm"
                                                    onChange={e => setTimelineConfig(c => ({ ...c, era_name: e.target.value || null }))}
                                                    onBlur={e => void persistTimelineConfig({ era_name: e.target.value || null })}
                                                />
                                            </div>
                                        </div>

                                        {/* Année / mois courant */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <p className="text-xs font-medium text-muted-foreground">Année actuelle</p>
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

                                        {/* Liste des mois */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs font-medium text-muted-foreground">Mois du calendrier</p>
                                                {timelineConfig.month_names.length === 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void persistTimelineConfig({ month_names: ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"] })}
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
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const next = timelineConfig.month_names.filter((_, j) => j !== i);
                                                                    const currentMonth = timelineConfig.current_month;
                                                                    void persistTimelineConfig({
                                                                        month_names: next,
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
                                                    placeholder="Nom du mois…"
                                                    className="h-8 text-sm"
                                                    onChange={e => setNewMonthName(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter" && newMonthName.trim()) {
                                                            e.preventDefault();
                                                            const next = [...timelineConfig.month_names, newMonthName.trim()];
                                                            void persistTimelineConfig({ month_names: next });
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
                                                        void persistTimelineConfig({ month_names: next });
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

                    </form>
                </Form>

                {/* Confirmation purge */}
                <AlertDialog open={!!pendingRestriction} onOpenChange={open => { if (!open) setPendingRestriction(null); }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Activer la restriction ?</AlertDialogTitle>
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

                <SheetFooter className="border-t border-border-soft px-6 py-3 flex-row justify-start">
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
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
