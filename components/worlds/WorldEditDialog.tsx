"use client";

import * as React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

/**
 * Edit dialog pour un « monde ».
 * - Zod + RHF
 * - Sauvegarde via supabase OU callback onSave
 * - open/onOpenChange optionnels (fallback interne)
 */

export type World = {
    id: string;
    name: string;
    description?: string | null;
    icon_url?: string | null;
    banner_url?: string | null;
    color?: string | null; // hex (#RRGGBB)
};

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

export default function WorldEditDialog({
    open,
    onOpenChange,
    world,
    onSave,
    onUpdated,
    trigger,
}: WorldEditDialogProps) {
    const supabase = createClient();
    const [submitting, setSubmitting] = React.useState(false);

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
            console.log("Updated world:", updated);
            setOpen(false);
        } catch (e: any) {
            console.error(e);
            toast.error(e?.message ?? "Une erreur s’est produite.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={mergedOpen} onOpenChange={setOpen}>
            {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Éditer le monde</DialogTitle>
                    <DialogDescription>
                        Modifiez le nom et l’apparence. Vous pouvez
                        prévisualiser l’icône et la bannière.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(handleSubmit)}
                        className="space-y-6"
                    >
                        <Tabs defaultValue="general" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="general">
                                    Général
                                </TabsTrigger>
                                <TabsTrigger value="appearance">
                                    Apparence
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="general" className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nom du monde</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Ex. Monde de Veldis"
                                                    autoFocus
                                                    {...field}
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
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    rows={4}
                                                    placeholder="Brève description du monde…"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </TabsContent>

                            <TabsContent
                                value="appearance"
                                className="space-y-6"
                            >
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="icon_url"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    Icône (URL)
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="https://…/icon.png"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    PNG/SVG recommandé, carré.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="banner_url"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    Bannière (URL)
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="https://…/banner.jpg"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    Image large pour l’entête.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="color"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    Couleur principale
                                                </FormLabel>
                                                <div className="flex items-center gap-2">
                                                    <FormControl>
                                                        <Input
                                                            placeholder="#1f2937"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <div
                                                        className="h-8 w-8 rounded-full border"
                                                        style={{
                                                            background:
                                                                field.value ||
                                                                "transparent",
                                                        }}
                                                        aria-label="Aperçu de la couleur"
                                                    />
                                                </div>
                                                <FormDescription>
                                                    Hex (#RRGGBB). Utilisée pour
                                                    styliser l’en-tête.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <PreviewCard
                                        title="Aperçu icône"
                                        url={form.watch("icon_url")}
                                        fallbackIcon
                                    />
                                    <PreviewCard
                                        title="Aperçu bannière"
                                        url={form.watch("banner_url")}
                                        banner
                                    />
                                </div>
                            </TabsContent>
                        </Tabs>

                        <DialogFooter className="gap-2 sm:gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={submitting}
                            >
                                Annuler
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                                        Enregistrement…
                                    </>
                                ) : (
                                    "Enregistrer"
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

function PreviewCard({
    title,
    url,
    fallbackIcon,
    banner,
}: {
    title: string;
    url?: string | null;
    fallbackIcon?: boolean;
    banner?: boolean;
}) {
    const src = (url ?? "").trim();
    const has = Boolean(src);
    return (
        <div className="rounded-2xl border bg-muted/30 p-4">
            <div className="mb-2 text-sm font-medium text-muted-foreground">
                {title}
            </div>
            <div
                className={`relative grid place-items-center overflow-hidden rounded-xl bg-background ${
                    banner ? "h-28" : "h-28 w-full"
                }`}
            >
                {has ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={src}
                        alt={title}
                        className={`object-cover ${
                            banner ? "h-full w-full" : "h-20 w-20 rounded-full"
                        }`}
                    />
                ) : fallbackIcon ? (
                    <div className="grid h-20 w-20 place-items-center rounded-full border bg-muted">
                        <ImageIcon className="h-6 w-6 opacity-60" />
                    </div>
                ) : (
                    <div className="h-full w-full" />
                )}
            </div>
        </div>
    );
}
