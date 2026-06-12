"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { inviteUserToWorld } from "@/app/actions/invite";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Loader2, Mail, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Role = "owner" | "admin" | "editor" | "player" | "viewer";

const emailSchema = z.string().email("Courriel invalide");

type FoundUser = {
    user_id: string;
    email: string;
    username: string | null;
};

type Member = {
    user_id: string;
    role: Role;
    username: string | null;
    avatar_url: string | null;
};

const ROLE_LABELS: Record<Role, string> = {
    owner: "Propriétaire",
    admin: "Admin",
    editor: "Éditeur",
    player: "Joueur",
    viewer: "Lecteur",
};

const ROLE_ORDER: Record<Role, number> = {
    owner: 0,
    admin: 1,
    editor: 2,
    player: 3,
    viewer: 4,
};

/** Capacités affichées dans le récap, alignées sur les policies RLS */
const PERMISSIONS: { label: string; roles: Role[] }[] = [
    {
        label: "Lire les conversations et les onglets",
        roles: ["owner", "admin", "editor", "player", "viewer"],
    },
    {
        label: "Poster des messages et réagir",
        roles: ["owner", "admin", "editor", "player"],
    },
    {
        label: "Créer des parties",
        roles: ["owner", "admin", "editor", "player"],
    },
    {
        label: "Modifier les parties des autres",
        roles: ["owner", "admin", "editor"],
    },
    {
        label: "Gérer les onglets descriptifs",
        roles: ["owner", "admin", "editor"],
    },
    {
        label: "Modifier le monde et gérer les membres",
        roles: ["owner", "admin"],
    },
];

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
    const [members, setMembers] = useState<Member[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [pendingRemoval, setPendingRemoval] = useState<Member | null>(null);
    const supabase = useMemo(() => createClient(), []);
    const router = useRouter();

    async function loadMembers() {
        setMembersLoading(true);
        const { data: rows, error } = await supabase
            .from("world_members")
            .select("user_id, role")
            .eq("world_id", worldId);

        if (error || !rows) {
            setMembers([]);
            setMembersLoading(false);
            return;
        }

        const ids = rows.map((r) => r.user_id);
        const { data: profiles } = await supabase
            .from("profiles")
            .select("id, username, avatar_url")
            .in("id", ids);

        const byId = new Map(
            (profiles ?? []).map((p) => [
                p.id,
                { username: p.username, avatar_url: p.avatar_url },
            ])
        );

        setMembers(
            rows
                .map((r) => ({
                    user_id: r.user_id,
                    role: r.role as Role,
                    username: byId.get(r.user_id)?.username ?? null,
                    avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
                }))
                .sort(
                    (a, b) =>
                        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
                        (a.username ?? "").localeCompare(b.username ?? "")
                )
        );
        setMembersLoading(false);
    }

    /**
     * Prévient l'utilisateur concerné via Broadcast (canal personnel).
     * Plus fiable que postgres_changes : pas de RLS, pas de publication.
     */
    async function broadcastMembership(
        userId: string,
        action: "added" | "removed"
    ) {
        try {
            const ch = supabase.channel(`user-events:${userId}`);
            await new Promise<void>((resolve) => {
                const t = setTimeout(resolve, 2000); // garde-fou
                ch.subscribe((status) => {
                    if (status === "SUBSCRIBED") {
                        clearTimeout(t);
                        resolve();
                    }
                });
            });
            await ch.send({
                type: "broadcast",
                event: "world_membership",
                payload: { action, world_id: worldId },
            });
            void supabase.removeChannel(ch);
        } catch {
            // best-effort : le refresh serveur rattrapera au prochain chargement
        }
    }

    async function updateMemberRole(m: Member, newRole: Role) {
        if (newRole === m.role) return;

        const { error } = await supabase
            .from("world_members")
            .update({ role: newRole })
            .eq("world_id", worldId)
            .eq("user_id", m.user_id);

        if (error) {
            toast.error("Impossible de modifier le rôle.", {
                description: error.message,
            });
            return;
        }

        setMembers((prev) =>
            prev
                .map((x) =>
                    x.user_id === m.user_id ? { ...x, role: newRole } : x
                )
                .sort(
                    (a, b) =>
                        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
                        (a.username ?? "").localeCompare(b.username ?? "")
                )
        );
        toast.success(
            `${m.username ? `@${m.username}` : "Membre"} : ${ROLE_LABELS[newRole]}`
        );
        router.refresh();
    }

    async function removeMember(m: Member) {
        const { error } = await supabase
            .from("world_members")
            .delete()
            .eq("world_id", worldId)
            .eq("user_id", m.user_id);

        if (error) {
            toast.error("Impossible de retirer ce membre.", {
                description: error.message,
            });
            return;
        }

        setMembers((prev) => prev.filter((x) => x.user_id !== m.user_id));
        toast.success(
            `${m.username ? `@${m.username}` : "Le membre"} a été retiré du monde.`
        );
        void broadcastMembership(m.user_id, "removed");
        router.refresh();
    }

    // reset à l’ouverture + chargement des membres actuels
    useEffect(() => {
        if (open) {
            setQuery("");
            setResults([]);
            setSelected(null);
            setEmail("");
            setRole(defaultRole);
            setError(null);
            void loadMembers();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            // Utilisateur inexistant — envoyer une invitation par courriel
            const result = await inviteUserToWorld(target, worldId, role as "admin" | "editor" | "player" | "viewer");
            if (result.error) {
                setError(result.error);
            } else {
                toast.success("Invitation envoyée", {
                    description: `Un courriel d'invitation a été envoyé à ${target}.`,
                });
                setOpen(false);
            }
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

            toast.success("Membre ajouté", {
                description: selected?.username
                    ? `@${selected.username} a rejoint le monde.`
                    : "L'utilisateur a été ajouté au monde.",
            });
            void broadcastMembership(userId, "added");
            setOpen(false);
            router.refresh();
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
                    <div className="overflow-hidden rounded-xl border">
                        <Command shouldFilter={false}>
                            <CommandInput
                                placeholder="Rechercher (email ou username)…"
                                value={query}
                                onValueChange={setQuery}
                            />
                            <CommandList className="max-h-56">
                                {loading && (
                                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Recherche…
                                    </div>
                                )}
                                {!loading && query.trim().length >= 2 && (
                                    <CommandEmpty>
                                        Aucun utilisateur trouvé (déjà membre,
                                        ou inexistant).
                                    </CommandEmpty>
                                )}
                                {!loading && results.length > 0 && (
                                    <CommandGroup heading="Utilisateurs">
                                        {results.map((u) => (
                                            <CommandItem
                                                key={u.user_id}
                                                value={u.email}
                                                onSelect={() => {
                                                    setSelected(u);
                                                    setEmail(u.email);
                                                }}
                                                className="flex items-center gap-3"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium">
                                                        {u.username
                                                            ? `@${u.username}`
                                                            : u.email}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground truncate">
                                                        {u.email}
                                                    </div>
                                                </div>
                                                <Check
                                                    className={cn(
                                                        "h-4 w-4 shrink-0",
                                                        selected?.user_id ===
                                                            u.user_id
                                                            ? "opacity-100"
                                                            : "opacity-0"
                                                    )}
                                                />
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
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

                        {/* Récap des permissions du rôle sélectionné */}
                        <div className="mt-1 rounded-xl border border-border-soft px-3 py-2.5">
                            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                                Permissions « {ROLE_LABELS[role]} »
                            </div>
                            <ul className="space-y-1">
                                {PERMISSIONS.map((p) => {
                                    const allowed = p.roles.includes(role);
                                    return (
                                        <li
                                            key={p.label}
                                            className={cn(
                                                "flex items-center gap-2 text-xs",
                                                allowed
                                                    ? "text-foreground"
                                                    : "text-muted-foreground/60 line-through decoration-muted-foreground/30"
                                            )}
                                        >
                                            {allowed ? (
                                                <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                                            ) : (
                                                <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                                            )}
                                            {p.label}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">
                            {error}
                        </div>
                    )}

                    <Separator />

                    {/* Membres actuels */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Membres actuels</Label>
                            <span className="text-xs text-muted-foreground">
                                {members.length} membre
                                {members.length > 1 ? "s" : ""}
                            </span>
                        </div>
                        <div className="max-h-44 space-y-0.5 overflow-y-auto [scrollbar-width:thin]">
                            {membersLoading && (
                                <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Chargement…
                                </div>
                            )}
                            {!membersLoading &&
                                members.map((m) => (
                                    <div
                                        key={m.user_id}
                                        className="flex items-center gap-2.5 rounded-xl px-2 py-1.5"
                                    >
                                        <Avatar className="h-7 w-7 shrink-0">
                                            <AvatarImage
                                                src={m.avatar_url ?? undefined}
                                                alt={m.username ?? ""}
                                            />
                                            <AvatarFallback className="text-[10px] uppercase">
                                                {(m.username ?? "?").slice(0, 2)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                            {m.username
                                                ? `@${m.username}`
                                                : m.user_id.slice(0, 8)}
                                        </span>
                                        {canManage && m.role !== "owner" ? (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button
                                                        type="button"
                                                        className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                                                        aria-label={`Modifier le rôle de ${m.username ?? "ce membre"}`}
                                                    >
                                                        {ROLE_LABELS[m.role]}
                                                        <ChevronDown className="h-3 w-3" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent
                                                    align="end"
                                                    className="w-36"
                                                >
                                                    {(
                                                        [
                                                            "admin",
                                                            "editor",
                                                            "player",
                                                            "viewer",
                                                        ] as Role[]
                                                    ).map((r) => (
                                                        <DropdownMenuItem
                                                            key={r}
                                                            onClick={() =>
                                                                void updateMemberRole(
                                                                    m,
                                                                    r
                                                                )
                                                            }
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-3.5 w-3.5",
                                                                    m.role === r
                                                                        ? "opacity-100"
                                                                        : "opacity-0"
                                                                )}
                                                            />
                                                            {ROLE_LABELS[r]}
                                                        </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        ) : (
                                            <span
                                                className={cn(
                                                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                                    m.role === "owner"
                                                        ? "bg-primary/10 text-foreground"
                                                        : "bg-secondary text-muted-foreground"
                                                )}
                                            >
                                                {ROLE_LABELS[m.role]}
                                            </span>
                                        )}
                                        {canManage && m.role !== "owner" && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setPendingRemoval(m)
                                                }
                                                aria-label={`Retirer ${m.username ?? "ce membre"} du monde`}
                                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Confirmation de retrait */}
                    <AlertDialog
                        open={!!pendingRemoval}
                        onOpenChange={(o) => {
                            if (!o) setPendingRemoval(null);
                        }}
                    >
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Retirer{" "}
                                    {pendingRemoval?.username
                                        ? `@${pendingRemoval.username}`
                                        : "ce membre"}{" "}
                                    du monde ?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    Ce membre perdra immédiatement tout accès au
                                    monde, à ses parties et à ses messages. Tu
                                    pourras le réinviter plus tard.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                    className="bg-destructive text-white hover:bg-destructive/90"
                                    onClick={() => {
                                        if (pendingRemoval)
                                            void removeMember(pendingRemoval);
                                        setPendingRemoval(null);
                                    }}
                                >
                                    Retirer
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

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
