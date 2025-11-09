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
import { Label } from "@/components/ui/label";
import { createPersona } from "@/app/personas/actions";
import { getUserQuotaClient } from "@/lib/userQuota"; // <<— NEW

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

    // Quota (plan, owned, quotaLimit, quotaReached)
    const [quota, setQuota] = useState<{
        plan: "free" | "pro" | "team" | "lifetime";
        owned: number;
        quotaLimit: number; // Infinity si illimité
        quotaReached: boolean;
    } | null>(null);

    // Récupérer/rafraîchir le quota (au montage et à chaque ouverture du dialog)
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const q = await getUserQuotaClient("personas");
                if (!cancelled) setQuota(q);
            } catch {
                if (!cancelled) setQuota(null);
            }
        }
        load();
        // Re-check quand on ouvre le dialog (utile si l’utilisateur en crée un ailleurs)
        if (open) load();
        return () => {
            cancelled = true;
        };
    }, [open]);

    // Fermer le dialog à la création réussie
    useEffect(() => {
        if (state?.ok) setOpen(false);
    }, [state?.ok]);

    // (optionnel) log des erreurs
    useEffect(() => {
        if (state?.error) console.info("Create persona error:", state.error);
    }, [state?.error]);

    const quotaReached = quota?.quotaReached ?? false;
    const disableCreate = (disabled ?? false) || quotaReached;

    const hint =
        quota == null
            ? "—"
            : quota.plan === "free"
            ? `Gratuit : ${quota.owned}/${
                  Number.isFinite(quota.quotaLimit) ? quota.quotaLimit : "∞"
              }`
            : `Plan ${quota.plan} : illimité`;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button disabled={disableCreate} title={hint}>
                    Nouveau persona
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Créer un persona</DialogTitle>
                </DialogHeader>

                {/* Bandeau d’info plan/quota */}
                <div className="mb-2 text-xs text-muted-foreground">{hint}</div>

                {quotaReached ? (
                    <div className="rounded-md bg-muted p-3 text-sm">
                        Ton quota gratuit est atteint
                        {typeof quota?.owned === "number" &&
                        Number.isFinite(quota?.quotaLimit)
                            ? ` (${quota.owned}/${quota.quotaLimit}).`
                            : "."}{" "}
                        Passe à un plan supérieur pour créer plus de personas.
                    </div>
                ) : (
                    <form action={formAction} className="space-y-3">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Nom</Label>
                            <Input
                                name="name"
                                placeholder="Ex. Kaori"
                                required
                                maxLength={40}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Bio</Label>
                            <Textarea
                                name="bio"
                                placeholder="Quelques lignes sur le personnage"
                                maxLength={500}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">
                                Avatar URL (optionnel)
                            </Label>
                            <Input
                                name="avatar_url"
                                placeholder="https://..."
                            />
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
                        {state?.error && (
                            <p className="text-sm text-red-600">
                                {state.error}
                            </p>
                        )}
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
