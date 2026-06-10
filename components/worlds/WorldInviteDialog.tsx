"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Loader2, Mail, Search, UserPlus } from "lucide-react";

type Role = "owner" | "admin" | "editor" | "player" | "viewer";

const emailSchema = z.string().email("Courriel invalide");

type FoundUser = {
    user_id: string;
    email: string;
    username: string | null;
    full_name: string | null;
};

export function WorldInviteDialog({
    worldId,
    ownerId,
    canManage, // true si owner/admin (UI), RLS fait foi côté DB
    defaultRole = "player",
}: {
    worldId: string;
    ownerId: string;
    canManage?: boolean;
    defaultRole?: Role;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<FoundUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<FoundUser | null>(null);
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<Role>(defaultRole);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const supabase = useMemo(() => createClient(), []);

    // reset à l’ouverture
    useEffect(() => {
        if (open) {
            setQuery("");
            setResults([]);
            setSelected(null);
            setEmail("");
            setRole(defaultRole);
            setError(null);
        }
    }, [open, defaultRole]);

    // recherche (debounce)
    useEffect(() => {
        if (!open) return;
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            return;
        }
        let canceled = false;
        setLoading(true);
        const t = setTimeout(async () => {
            try {
                const { data, error } = await supabase.rpc(
                    "search_users_for_world",
                    {
                        p_world: worldId,
                        p_q: q,
                        p_limit: 10,
                    }
                );
                if (!canceled) setResults(error ? [] : data ?? []);
            } finally {
                if (!canceled) setLoading(false);
            }
        }, 250);
        return () => {
            canceled = true;
            clearTimeout(t);
        };
    }, [query, supabase, worldId, open]);

    async function resolveUserId(): Promise<string | null> {
        // 1) si un résultat est sélectionné, on a déjà l'id
        if (selected?.user_id) return selected.user_id;

        // 2) sinon, on tente email exact saisi
        const target = email.trim();
        if (!target) return null;

        const parsed = emailSchema.safeParse(target);
        if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return null;
        }

        const { data, error } = await supabase.rpc("search_users_for_world", {
            p_world: worldId,
            p_q: target,
            p_limit: 1,
        });
        if (error || !data || data.length === 0) {
            setError("Utilisateur introuvable pour ce courriel.");
            return null;
        }
        const u = data[0] as FoundUser;
        return u.user_id ?? null;
    }

    async function onSubmit() {
        setError(null);
        setSubmitting(true);
        try {
            const userId = await resolveUserId();
            if (!userId) return;

            if (userId === ownerId && role !== "owner") {
                setError("Impossible de modifier le rôle du propriétaire.");
                return;
            }

            // Ajout direct dans world_members (ou MAJ de rôle si déjà membre)
            const { error } = await supabase
                .from("world_members")
                .upsert(
                    { world_id: worldId, user_id: userId, role },
                    { onConflict: "world_id,user_id" }
                );

            if (error) {
                // Unique owner ?
                if (
                    /uniq_world_owner|owner/i.test(error.message) &&
                    role === "owner"
                ) {
                    setError("Ce monde a déjà un propriétaire.");
                } else {
                    setError("Échec de l’ajout du membre.");
                    console.error(error);
                }
                return;
            }

            setOpen(false);
        } finally {
            setSubmitting(false);
        }
    }

    const canSubmit = (!!selected || email.length > 0) && !!role;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canManage}
                    title={
                        canManage
                            ? "Ajouter un membre"
                            : "Accès requis (owner/admin)"
                    }
                >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Inviter
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Ajouter un membre</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                        Recherche par <b>email</b> ou <b>username</b>, puis
                        assigne un rôle.
                    </div>

                    {/* Recherche (Command = combobox) */}
                    <div className="rounded-md border">
                        <Command shouldFilter={false}>
                            <div className="flex items-center gap-2 px-2 pt-2">
                                <Search className="h-4 w-4 opacity-70" />
                                <CommandInput
                                    placeholder="Rechercher (email ou username)…"
                                    value={query}
                                    onValueChange={setQuery}
                                />
                            </div>
                            <CommandList className="max-h-56">
                                {loading && (
                                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Recherche…
                                    </div>
                                )}
                                {!loading && (
                                    <>
                                        <CommandEmpty>
                                            Aucun résultat.
                                        </CommandEmpty>
                                        <CommandGroup heading="Utilisateurs">
                                            {results.map((u) => (
                                                <CommandItem
                                                    key={u.user_id}
                                                    value={u.email}
                                                    onSelect={() => {
                                                        setSelected(u);
                                                        setEmail(u.email);
                                                    }}
                                                    className={cn(
                                                        "flex items-center justify-between gap-2"
                                                    )}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="truncate">
                                                            {u.full_name ??
                                                                u.email}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            @{u.username ?? "—"}{" "}
                                                            · {u.email}
                                                        </div>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            setSelected(u);
                                                            setEmail(u.email);
                                                        }}
                                                    >
                                                        Sélectionner
                                                    </Button>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </>
                                )}
                            </CommandList>
                        </Command>
                    </div>

                    <div className="text-xs text-muted-foreground">
                        Ou saisis le courriel exact d’un compte existant :
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="invite-email">Courriel</Label>
                        <div className="relative">
                            <Mail className="absolute left-2 top-2.5 h-4 w-4 opacity-70" />
                            <Input
                                id="invite-email"
                                className="pl-8"
                                placeholder="exemple@domaine.com"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    setSelected(null);
                                }}
                                autoComplete="off"
                            />
                        </div>
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Rôle</Label>
                        <Select
                            value={role}
                            onValueChange={(v) => setRole(v as Role)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Choisir un rôle" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="editor">Éditeur</SelectItem>
                                <SelectItem value="player">Joueur</SelectItem>
                                <SelectItem value="viewer">Lecteur</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {error && (
                        <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">
                            {error}
                        </div>
                    )}

                    <Separator />

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={onSubmit}
                            disabled={!canSubmit || submitting}
                        >
                            {submitting && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Ajouter
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
