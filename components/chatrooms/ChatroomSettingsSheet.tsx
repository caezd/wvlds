"use client";

import * as React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { updateChatroomSettings } from "@/app/actions/chatrooms";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetTrigger,
    SheetFooter,
    SheetClose,
} from "@/components/ui/sheet";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const FormSchema = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(1, "Nom requis").max(80),
    banner_url: z.string().url().optional().or(z.literal("")),
    icon_url: z.string().url().optional().or(z.literal("")),
});

type Props = {
    canEdit?: boolean; // 👈 nouveau (par défaut false)
    chatroom: {
        id: string;
        title: string | null;
        banner_url: string | null;
        icon_url: string | null;
        // Optionnel: pour cacher le bouton avant le 1er message
        messages_count?: number;
    };
    // si tu veux forcer l'icône du bouton à l'extérieur, passe false ici
    showTriggerButton?: boolean;
};

export default function ChatroomSettingsSheet({
    canEdit,
    chatroom,
    showTriggerButton = true,
}: Props) {
    const router = useRouter();
    const [open, setOpen] = React.useState(false);
    const [uploading, setUploading] = React.useState<"banner" | "icon" | null>(
        null
    );

    const supabase = createClient();
    const [userId, setUserId] = React.useState<string | null>(null);

    React.useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setUserId(data.user?.id ?? null);
        });
    }, [supabase]);

    const form = useForm<z.infer<typeof FormSchema>>({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            id: chatroom.id,
            title: chatroom.title ?? "",
            banner_url: chatroom.banner_url ?? "",
            icon_url: chatroom.icon_url ?? "",
        },
    });

    const canShowTrigger =
        canEdit && showTriggerButton && (chatroom.messages_count ?? 1) > 0;

    async function onSubmit(values: z.infer<typeof FormSchema>) {
        await updateChatroomSettings(values);
        setOpen(false);
        router.refresh();
    }

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            {canShowTrigger ? (
                <SheetTrigger asChild>
                    <Button
                        size="icon"
                        aria-label="Options de la salle"
                        title="Options"
                        className="hover:bg-hover-400"
                    >
                        <Settings className="h-5 w-5" />
                    </Button>
                </SheetTrigger>
            ) : null}

            <SheetContent side="right" className="w-full sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle>Paramètres de la salle</SheetTitle>
                    <SheetDescription>
                        Modifie le nom, la bannière et l’icône de la chatroom.
                    </SheetDescription>
                </SheetHeader>

                <Separator className="my-4" />

                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-6"
                    >
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nom de la salle</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="Nom de la salle..."
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Icône */}
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label>Icône</Label>
                                </div>
                                <FormField
                                    control={form.control}
                                    name="icon_url"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                URL Icône (optionnel)
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="https://..."
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-12 w-12">
                                        {uploading === "icon" ? (
                                            <AvatarFallback>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            </AvatarFallback>
                                        ) : form.watch("icon_url") ? (
                                            <AvatarImage
                                                src={form.watch("icon_url")!}
                                                alt="Icône"
                                            />
                                        ) : (
                                            <AvatarFallback>IC</AvatarFallback>
                                        )}
                                    </Avatar>
                                    <span className="text-sm text-muted-foreground">
                                        Aperçu
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Bannière */}
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label>Bannière</Label>
                                </div>
                                <FormField
                                    control={form.control}
                                    name="banner_url"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                URL Bannière (optionnel)
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="https://..."
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="rounded-xl overflow-hidden border">
                                    {uploading === "banner" ? (
                                        <div className="h-24 flex items-center justify-center">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        </div>
                                    ) : form.watch("banner_url") ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={form.watch("banner_url")!}
                                            alt="Bannière"
                                            className="w-full max-h-40 object-cover"
                                        />
                                    ) : (
                                        <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
                                            Aucun aperçu
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <SheetFooter className="gap-2">
                            <SheetClose asChild>
                                <Button type="button" variant="outline">
                                    Annuler
                                </Button>
                            </SheetClose>
                            <Button type="submit">Enregistrer</Button>
                        </SheetFooter>
                    </form>
                </Form>
            </SheetContent>
        </Sheet>
    );
}
