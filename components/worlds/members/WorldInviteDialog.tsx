"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { inviteUserToWorld } from "@/app/actions/invite";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { TABLE } from "@/lib/constants";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { canManageRole, WORLD_PERMISSION_GROUPS, permissionI18nKey, permissionListHas, type WorldRoleRow } from "@/lib/worldPermissions";
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
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { cn } from "@/lib/utils";
import { Check, Loader2, Mail, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { RoleChip } from "./RoleChip";

/** Valeur du sélecteur pour « les rôles par défaut du monde ». */
const DEFAULT_ROLES = "__default__";

const emailSchema = z.string().email();

type FoundUser = {
    user_id: string;
    email: string;
    username: string | null;
};

type PendingInvitation = {
    id: string;
    invitee_id: string;
    role_id: string | null;
    created_at: string;
    username: string | null;
    avatar_url: string | null;
};

/**
 * Inviter quelqu'un dans le monde, avec un rôle ou les rôles par défaut.
 *
 * La gestion des membres déjà présents (rôles, retrait) vit sur leurs cartes,
 * dans `WorldMembersPanel` — ici il n'y a que l'invitation, et les invitations
 * en attente.
 */
export function WorldInviteDialog({ worldId }: { worldId: string }) {
    const t = useTranslations("worlds.invite");
    const tRoles = useTranslations("worlds.roles");
    const tCommon = useTranslations("common");
    const { roles, membership } = useWorldMembership();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<FoundUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<FoundUser | null>(null);
    const [email, setEmail] = useState("");
    const [roleId, setRoleId] = useState<string>(DEFAULT_ROLES);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingInvites, setPendingInvites] = useState<PendingInvitation[]>([]);
    const [pendingCancelInvite, setPendingCancelInvite] = useState<PendingInvitation | null>(null);
    const supabase = useMemo(() => createClient(), []);
    const { userId: currentUserId, username: currentUsername } = useCurrentUser();

    // Seuls les rôles sous son rang sont proposés : la policy refuse les autres.
    const grantable = useMemo(
        () => roles.filter((r) => canManageRole(membership, r, "members.manage")),
        [roles, membership],
    );
    const defaultRoles = useMemo(() => roles.filter((r) => r.is_default), [roles]);
    const chosenRole: WorldRoleRow | null = roleId === DEFAULT_ROLES ? null : (roles.find((r) => r.id === roleId) ?? null);
    const previewRoles = useMemo(() => (chosenRole ? [chosenRole] : defaultRoles), [chosenRole, defaultRoles]);
    const previewPermissions = useMemo(() => {
        const set = new Set<string>();
        for (const r of previewRoles) for (const p of r.permissions) set.add(p);
        return [...set];
    }, [previewRoles]);

    async function loadPendingInvitations() {
        type InvRow = { id: string; invitee_id: string; role_id: string | null; created_at: string };
        type ProfileRow = { id: string; username: string | null; avatar_url: string | null };

        const { data: invData, error: invError } = await supabase
            .from(TABLE.WORLD_INVITATIONS)
            .select("id, invitee_id, role_id, created_at")
            .eq("world_id", worldId)
            .eq("status", "pending");
        if (invError) console.error("[WorldInviteDialog] invitations illisibles :", invError.message);
        const invRows = (invData ?? []) as InvRow[];
        if (invRows.length === 0) {
            setPendingInvites([]);
            return;
        }

        const { data: profileData } = await supabase
            .from(TABLE.PROFILES)
            .select("id, username, avatar_url")
            .in("id", invRows.map((r) => r.invitee_id));
        const byId = new Map(((profileData ?? []) as ProfileRow[]).map((p) => [p.id, p]));

        setPendingInvites(
            invRows.map((r) => ({
                id: r.id,
                invitee_id: r.invitee_id,
                role_id: r.role_id,
                created_at: r.created_at,
                username: byId.get(r.invitee_id)?.username ?? null,
                avatar_url: byId.get(r.invitee_id)?.avatar_url ?? null,
            })),
        );
    }

    async function cancelInvitation(inv: PendingInvitation) {
        const { error } = await supabase.from(TABLE.WORLD_INVITATIONS).delete().eq("id", inv.id);
        if (error) {
            toast.error(t("cancelFailed"), { description: error.message });
            return;
        }
        setPendingInvites((prev) => prev.filter((x) => x.id !== inv.id));
        toast.success(t("cancelled", { name: nameOf(inv) }));
    }

    function nameOf(x: { username: string | null; invitee_id?: string; user_id?: string }) {
        return x.username ? `@${x.username}` : (x.invitee_id ?? x.user_id ?? "").slice(0, 8);
    }

    // reset à l'ouverture + chargement des invitations en attente
    useEffect(() => {
        if (open) {
            setQuery("");
            setResults([]);
            setSelected(null);
            setEmail("");
            setRoleId(DEFAULT_ROLES);
            setError(null);
            void loadPendingInvitations();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

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
        const timer = setTimeout(async () => {
            try {
                const { data, error } = await supabase.rpc("search_users_for_world", {
                    p_world: worldId,
                    p_q: q,
                    p_limit: 10,
                });
                if (!canceled) setResults(error ? [] : data ?? []);
            } finally {
                if (!canceled) setLoading(false);
            }
        }, 250);
        return () => {
            canceled = true;
            clearTimeout(timer);
        };
    }, [query, supabase, worldId, open]);

    async function resolveUserId(): Promise<string | null> {
        // 1) si un résultat est sélectionné, on a déjà l'id
        if (selected?.user_id) return selected.user_id;

        // 2) sinon, on tente email exact saisi
        const target = email.trim();
        if (!target) return null;

        if (!emailSchema.safeParse(target).success) {
            setError(t("invalidEmail"));
            return null;
        }

        const { data, error } = await supabase.rpc("search_users_for_world", {
            p_world: worldId,
            p_q: target,
            p_limit: 1,
        });
        if (error || !data || data.length === 0) {
            // Utilisateur inexistant — envoyer une invitation par courriel
            const result = await inviteUserToWorld(target, worldId, chosenRole?.id ?? null);
            if (result.error) {
                setError(t("emailInviteFailed"));
            } else {
                toast.success(t("sent"), { description: t("sentByEmail", { email: target }) });
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

            const { data: worldData } = await supabase
                .from(TABLE.WORLDS)
                .select("name, icon_url, banner_url, description")
                .eq("id", worldId)
                .single();
            type WorldRow = { name: string; icon_url: string | null; banner_url: string | null; description: string | null };
            const wd = worldData as WorldRow | null;
            const worldName = wd?.name ?? null;
            const worldMeta = wd ? { icon_url: wd.icon_url, banner_url: wd.banner_url, description: wd.description } : null;

            // Supprime toute invitation existante (declined ou pending) avant d'en créer une nouvelle.
            // Évite le problème de UPSERT → UPDATE bloqué par la policy RLS invitee-only.
            const { error: cleanupError } = await supabase
                .from(TABLE.WORLD_INVITATIONS)
                .delete()
                .eq("world_id", worldId)
                .eq("invitee_id", userId);
            if (cleanupError) console.error("[WorldInviteDialog] ancienne invitation non retirée", cleanupError.message);

            const { error: invErr } = await supabase
                .from(TABLE.WORLD_INVITATIONS)
                .insert({ world_id: worldId, invitee_id: userId, inviter_id: currentUserId, role_id: chosenRole?.id ?? null });
            if (invErr) {
                setError(t("sendFailed"));
                console.error(invErr);
                return;
            }

            // L'invitation est enregistrée ; sans notification, l'invité ne
            // la verra pas apparaître. On ne fait pas échouer l'envoi pour
            // autant, mais on cesse de l'ignorer.
            const { error: notifError } = await supabase.from(TABLE.NOTIFICATIONS).insert({
                recipient_id: userId,
                type: "world_invite",
                world_id: worldId,
                actor_id: currentUserId,
                actor_name: currentUsername,
                content: worldName,
                metadata: worldMeta,
            });
            if (notifError) console.error("[WorldInviteDialog] notification non créée", notifError.message);

            toast.success(t("sent"), {
                description: selected?.username ? t("sentTo", { name: `@${selected.username}` }) : undefined,
            });
            setOpen(false);
        } finally {
            setSubmitting(false);
        }
    }

    const canSubmit = !!selected || email.length > 0;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="secondary" title={t("open")}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t("open")}
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">{t("intro")}</div>

                    {/* Recherche (Command = combobox) */}
                    <div className="overflow-hidden rounded-xl border">
                        <Command shouldFilter={false}>
                            <CommandInput placeholder={t("searchPlaceholder")} value={query} onValueChange={setQuery} />
                            <CommandList className="max-h-56">
                                {loading && (
                                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {t("searching")}
                                    </div>
                                )}
                                {!loading && query.trim().length >= 2 && <CommandEmpty>{t("noUserFound")}</CommandEmpty>}
                                {!loading && results.length > 0 && (
                                    <CommandGroup heading={t("usersHeading")}>
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
                                                        {u.username ? `@${u.username}` : u.email}
                                                    </div>
                                                    <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                                                </div>
                                                <Check
                                                    className={cn(
                                                        "h-4 w-4 shrink-0",
                                                        selected?.user_id === u.user_id ? "opacity-100" : "opacity-0",
                                                    )}
                                                />
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                )}
                            </CommandList>
                        </Command>
                    </div>

                    <div className="text-xs text-muted-foreground">{t("orExactEmail")}</div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="invite-email">{t("emailLabel")}</Label>
                        <div className="relative">
                            <Mail className="absolute left-2 top-2.5 h-4 w-4 opacity-70" />
                            <Input
                                id="invite-email"
                                className="pl-8"
                                placeholder={t("emailPlaceholder")}
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
                        <Label>{t("roleLabel")}</Label>
                        <Select value={roleId} onValueChange={setRoleId}>
                            <SelectTrigger aria-label={t("roleLabel")}>
                                <SelectValue placeholder={t("pickRole")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={DEFAULT_ROLES}>{t("defaultRoles")}</SelectItem>
                                {grantable.map((r) => (
                                    <SelectItem key={r.id} value={r.id}>
                                        <span className="flex items-center gap-2">
                                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                                            {r.name}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Récap : les rôles conférés et ce qu'ils permettent */}
                        <div className="mt-1 space-y-2 rounded-xl border border-border-soft px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1">
                                {previewRoles.length === 0 ? (
                                    <span className="text-xs italic text-muted-foreground">{t("noDefaultRole")}</span>
                                ) : (
                                    previewRoles.map((r) => <RoleChip key={r.id} role={r} />)
                                )}
                            </div>
                            {previewRoles.length > 0 && (
                                <ul className="space-y-1">
                                    {permissionListHas(previewPermissions, "administrator") ? (
                                        <li className="flex items-center gap-2 text-xs text-foreground">
                                            <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                                            {tRoles("permissions.administrator.label")}
                                        </li>
                                    ) : (
                                        Object.values(WORLD_PERMISSION_GROUPS)
                                            .flat()
                                            .filter((p) => p !== "administrator")
                                            .map((p) => {
                                                const allowed = previewPermissions.includes(p);
                                                return (
                                                    <li
                                                        key={p}
                                                        className={cn(
                                                            "flex items-center gap-2 text-xs",
                                                            allowed
                                                                ? "text-foreground"
                                                                : "text-muted-foreground/60 line-through decoration-muted-foreground/30",
                                                        )}
                                                    >
                                                        {allowed ? (
                                                            <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                                                        ) : (
                                                            <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                                                        )}
                                                        {tRoles(`permissions.${permissionI18nKey(p)}.label`)}
                                                    </li>
                                                );
                                            })
                                    )}
                                </ul>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
                    )}

                    {/* Invitations en attente */}
                    {pendingInvites.length > 0 && (
                        <>
                            <Separator />
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>{t("pendingHeading")}</Label>
                                    <span className="text-xs text-muted-foreground">{pendingInvites.length}</span>
                                </div>
                                <div className="max-h-32 space-y-0.5 overflow-y-auto [scrollbar-width:thin]">
                                    {pendingInvites.map((inv) => {
                                        const role = inv.role_id ? roles.find((r) => r.id === inv.role_id) : null;
                                        return (
                                            <div key={inv.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                                                <Avatar className="h-7 w-7 shrink-0">
                                                    <AvatarImage src={inv.avatar_url ?? undefined} alt="" />
                                                    <AvatarFallback className="text-[10px] uppercase">
                                                        {(inv.username ?? "?").slice(0, 2)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{nameOf(inv)}</span>
                                                <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                                    {role ? role.name : t("defaultRoles")} · {t("pendingBadge")}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setPendingCancelInvite(inv)}
                                                    aria-label={t("cancelAria", { name: nameOf(inv) })}
                                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}

                    <DeleteConfirmDialog
                        open={!!pendingCancelInvite}
                        onOpenChange={(o) => {
                            if (!o) setPendingCancelInvite(null);
                        }}
                        title={t("cancelConfirmTitle", { name: pendingCancelInvite ? nameOf(pendingCancelInvite) : "" })}
                        description={t("cancelConfirmDescription")}
                        confirmLabel={t("cancelConfirm")}
                        onConfirm={() => {
                            if (pendingCancelInvite) void cancelInvitation(pendingCancelInvite);
                            setPendingCancelInvite(null);
                        }}
                    />

                    <Separator />

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            {tCommon("cancel")}
                        </Button>
                        <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t("submit")}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
