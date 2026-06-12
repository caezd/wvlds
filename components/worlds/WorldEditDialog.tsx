"use client";

import * as React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
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
    HelpCircle,
    Loader2,
    Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
    onSave,
    onUpdated,
    trigger,
}: WorldEditDialogProps) {
    const supabase = createClient();
    const router = useRouter();
    const [submitting, setSubmitting] = React.useState(false);
    const [uploading, setUploading] = React.useState<
        null | "icon" | "banner"
    >(null);
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);

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
        },
        mode: "onChange",
    });

    // Réinjecte les valeurs quand le dialog (re)s’ouvre sur ce monde
    React.useEffect(() => {
        if (mergedOpen) {
            setConfirmDelete(false);
            form.reset({
                name: world.name ?? "",
                description: world.description ?? "",
                icon_url: world.icon_url ?? "",
                banner_url: world.banner_url ?? "",
                color: world.color ?? "",
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

        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        const path = `user-${user.id}/world-${world.id}/${kind}-${Date.now()}.${ext}`;

        const { error } = await supabase.storage
            .from("worlds")
            .upload(path, file, { upsert: true });
        if (error) throw error;

        return supabase.storage.from("worlds").getPublicUrl(path).data
            .publicUrl;
    }

    async function handleFile(file: File | undefined, kind: "icon" | "banner") {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            toast.error("Seules les images sont acceptées.");
            return;
        }
        setUploading(kind);
        try {
            const url = await uploadToWorlds(file, kind);
            form.setValue(kind === "icon" ? "icon_url" : "banner_url", url, {
                shouldDirty: true,
                shouldValidate: true,
            });
        } catch (e: any) {
            toast.error(e?.message ?? "Téléversement impossible.");
        } finally {
            setUploading(null);
        }
    }

    async function handleSubmit(values: WorldFormValues) {
        setSubmitting(true);
        try {
            const payload = {
                name: values.name.trim(),
                description: truthyOrNull(values.description),
                icon_url: truthyOrNull(values.icon_url),
                banner_url: truthyOrNull(values.banner_url),
                color: truthyOrNull(values.color),
            } as const;

            let updated: World | null = null;

            if (supabase) {
                const { data, error } = await supabase
                    .from("worlds")
                    .update(payload)
                    .eq("id", world.id)
                    .select()
                    .single();
                if (error) throw error;
                updated = (data as unknown as World) ?? null;
            } else if (onSave) {
                const maybe = await onSave(values);
                updated = (maybe as World) ?? { ...world, ...payload };
            } else {
                updated = { ...world, ...payload };
            }

            if (updated) onUpdated?.(updated);

            toast.success("Monde mis à jour", {
                description: "Les modifications ont été enregistrées.",
            });
            setOpen(false);
        } catch (e: any) {
            console.error(e);
            toast.error(e?.message ?? "Une erreur s’est produite.");
        } finally {
            setSubmitting(false);
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
        } catch (e: any) {
            toast.error(e?.message ?? "Suppression impossible.");
        } finally {
            setDeleting(false);
        }
    }

    const iconUrl = form.watch("icon_url");
    const bannerUrl = form.watch("banner_url");
    const color = form.watch("color");
    const colorPreset = COLOR_PRESETS.find((c) => c.value === color);

    return (
        <Dialog open={mergedOpen} onOpenChange={setOpen}>
            {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
            <DialogContent className="sm:max-w-xl max-h-[85svh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Paramètres du monde</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(handleSubmit)}
                        className="space-y-6"
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
                                        onClick={() =>
                                            form.setValue("icon_url", "", {
                                                shouldDirty: true,
                                            })
                                        }
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
                                            onClick={() =>
                                                form.setValue("color", c.value, {
                                                    shouldDirty: true,
                                                    shouldValidate: true,
                                                })
                                            }
                                        >
                                            <span
                                                className="mr-2 h-2.5 w-2.5 rounded-full"
                                                style={{ backgroundColor: c.value }}
                                            />
                                            {c.name}
                                        </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuItem
                                        onClick={() =>
                                            form.setValue("color", "", {
                                                shouldDirty: true,
                                                shouldValidate: true,
                                            })
                                        }
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
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* -- Bannière — drag & drop ----------------- */}
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
                                        onChange={(e) =>
                                            void handleFile(
                                                e.target.files?.[0],
                                                "banner"
                                            )
                                        }
                                    />
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() =>
                                            bannerInputRef.current?.click()
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ")
                                                bannerInputRef.current?.click();
                                        }}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            void handleFile(
                                                e.dataTransfer.files?.[0],
                                                "banner"
                                            );
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
                                                        Cliquer ou déposer pour
                                                        remplacer
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
                                                    <span className="text-blue-400">
                                                        parcourir
                                                    </span>
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
                                            onClick={() =>
                                                form.setValue("banner_url", "", {
                                                    shouldDirty: true,
                                                })
                                            }
                                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            Retirer la bannière
                                        </button>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* -- Footer : suppression + actions --------- */}
                        <div className="flex items-center justify-between gap-2 pt-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => void handleDelete()}
                                disabled={deleting}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                                {deleting ? (
                                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                ) : null}
                                {confirmDelete
                                    ? "Confirmer la suppression ?"
                                    : "Supprimer le monde"}
                            </Button>

                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setOpen(false)}
                                    disabled={submitting}
                                >
                                    Annuler
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={submitting || uploading !== null}
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Enregistrement…
                                        </>
                                    ) : (
                                        "Enregistrer"
                                    )}
                                </Button>
                            </div>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
