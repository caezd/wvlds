"use client";

import { useActionState, useState, useEffect } from "react";
import { z } from "zod";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPersona } from "@/app/personas/actions";

const Schema = z.object({
    name: z.string().min(1, "Requis").max(40, "40 caractères max."),
    bio: z.string().max(500, "500 caractères max.").optional(),
    avatar_url: z.string().url("URL invalide").optional().or(z.literal("")),
});

export default function PersonaCreateDialog({
    disabled,
}: {
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [state, formAction, pending] = useActionState(createPersona, {
        ok: false as boolean,
        error: undefined as string | undefined,
    });

    // Fermer/alerter quand le server action renvoie une réponse
    // (évite d'écrire un handler custom qui court-circuite la soumission native)
    useEffect(() => {
        if (state?.ok) setOpen(false);
    }, [state?.ok]);

    // (optionnel) afficher l’erreur
    useEffect(() => {
        if (state?.error) console.info("Create persona error:", state.error);
    }, [state?.error]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button disabled={disabled}>Nouveau persona</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Créer un persona</DialogTitle>
                </DialogHeader>
                <form action={formAction} className="space-y-3">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Nom</label>
                        <Input
                            name="name"
                            placeholder="Ex. Kaori"
                            required
                            maxLength={40}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Bio</label>
                        <Textarea
                            name="bio"
                            placeholder="Quelques lignes sur le personnage"
                            maxLength={500}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            Avatar URL (optionnel)
                        </label>
                        <Input name="avatar_url" placeholder="https://..." />
                    </div>
                    <div className="pt-2 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setOpen(false)}
                        >
                            Annuler
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? "Création..." : "Créer"}
                        </Button>
                    </div>
                    {/* Feedback simple */}
                    {state?.error && (
                        <p className="text-sm text-red-600">{state.error}</p>
                    )}
                </form>
            </DialogContent>
        </Dialog>
    );
}
