// components/worlds/WorldsSidebarClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useSelectedLayoutSegment, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    Plus,
    Globe2,
    Crown,
    Users,
    User,
    Shield,
    Loader2,
    GlobeLock,
    Globe,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client"; // ajuste ce chemin
import { cn } from "@/lib/utils"; // si tu as déjà ce helper shadcn
import { useWorldNotifications } from "@/components/notifications/WorldNotificationsProvider";

type Role = "owner" | "admin" | "editor" | "player" | "viewer";

type WorldRow = {
    id: string;
    name: string;
    slug: string | null;
    is_archived: boolean;
    owner_id: string;
    world_members: { user_id: string; role: Role }[];
};

export default function WorldsSidebarClient(props: {
    meId: string;
    plan: "free" | "pro" | "team" | "lifetime";
    ownedCount: number;
    quotaLimit: number;
    quotaReached: boolean;
    mine: WorldRow[];
    shared: WorldRow[];
    unreadMap?: Record<string, number>;
}) {
    const {
        meId,
        plan,
        ownedCount,
        quotaLimit,
        quotaReached,
        mine,
        shared,
        unreadMap,
    } = props;

    const [q, setQ] = useState("");
    const segment = useSelectedLayoutSegment(); // Si /worlds/[id], segment === [id]
    const filteredMine = useFilter(mine, q);
    const filteredShared = useFilter(shared, q);

    const { unreadMap: liveUnreadMap } = useWorldNotifications();
    const fallback = props.unreadMap ?? {};
    const unreadWithFallback = Object.keys(liveUnreadMap).length
        ? liveUnreadMap
        : fallback;

    return (
        <div className="flex h-full flex-col">
            <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">Mondes</h2>
                    <CreateWorldDialog
                        disabled={quotaReached}
                        plan={plan}
                        hint={
                            plan === "free"
                                ? quotaReached
                                    ? `Quota atteint (${ownedCount}/${quotaLimit})`
                                    : `Gratuit : ${ownedCount}/${quotaLimit}`
                                : plan === "pro"
                                ? "Pro : illimité"
                                : plan === "team"
                                ? "Team : illimité"
                                : "Lifetime : illimité"
                        }
                    />
                </div>

                <div className="mt-3">
                    <Input
                        placeholder="Rechercher…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                </div>

                <div className="mt-2 text-xs text-muted-foreground">
                    {plan === "free"
                        ? `Quota : ${ownedCount}/${quotaLimit}`
                        : `Plan : ${plan}`}
                </div>
            </div>

            <Separator />

            <ScrollArea className="flex-1">
                <Section title="Mes mondes" empty="Aucun monde possédé.">
                    {filteredMine.map((w) => (
                        <WorldItem
                            key={w.id}
                            meId={meId}
                            world={w}
                            active={segment === w.id}
                            unread={unreadWithFallback[w.id] ?? 0}
                        />
                    ))}
                </Section>

                <Section
                    title="Partagés avec moi"
                    empty="Rien de partagé pour le moment."
                >
                    {filteredShared.map((w) => (
                        <WorldItem
                            key={w.id}
                            meId={meId}
                            world={w}
                            active={segment === w.id}
                            unread={unreadWithFallback[w.id] ?? 0}
                        />
                    ))}
                </Section>
            </ScrollArea>
        </div>
    );
}

function useFilter(rows: WorldRow[], q: string) {
    return useMemo(() => {
        const qq = q.trim().toLowerCase();
        if (!qq) return rows;
        return rows.filter((r) => r.name.toLowerCase().includes(qq));
    }, [rows, q]);
}

function Section({
    title,
    icon,
    empty,
    children,
}: {
    title: string;
    icon?: React.ReactNode;
    empty: string;
    children: React.ReactNode;
}) {
    const has = Array.isArray(children) ? (children as any[]).length > 0 : true;
    return (
        <div className="px-2 py-3">
            <div className="px-2 mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {icon && icon}
                <span>{title}</span>
            </div>
            <div className="space-y-1">
                {has ? children : <Empty text={empty} />}
            </div>
        </div>
    );
}

function Empty({ text }: { text: string }) {
    return (
        <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            {text}
        </div>
    );
}

function WorldItem({
    world,
    meId,
    active,
    unread = 0,
}: {
    world: WorldRow;
    meId: string;
    active?: boolean;
    unread?: number;
}) {
    const myMembership = world.world_members.find((m) => m.user_id === meId);
    const role = myMembership?.role ?? "viewer";
    const roleLabel = roleToLabel(role);
    const isOwner = role === "owner";
    const members = world.world_members ?? [];
    const isShared = members.some((m) => m.user_id !== world.owner_id); // partagé si quelqu'un d'autre que l’owner est membre

    const { markWorldRead } = useWorldNotifications();

    return (
        <Link
            href={`/w/${world.id}`}
            onClick={() => {
                void markWorldRead(world.id);
            }}
            className={cn(
                "group flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-accent",
                active && "bg-accent"
            )}
        >
            <div className="flex min-w-0 items-center gap-2">
                <div className="relative">
                    {isShared ? (
                        <Globe className="h-4 w-4 opacity-80" />
                    ) : (
                        <GlobeLock className="h-4 w-4 opacity-80" />
                    )}
                    {unread > 0 && (
                        <span
                            title={`${unread} nouveauté(s)`}
                            className={cn(
                                `inline-flex h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_0_2px_black] text-[.65rem] absolute -right-0.5 -top-0.5 items-center justify-center leading-none text-black/80 font-medium`
                            )}
                        >
                            {/* {unread} */}
                        </span>
                    )}
                </div>

                <div className="min-w-0">
                    <div className="truncate">{world.name}</div>
                </div>
            </div>
        </Link>
    );
}

function roleToLabel(r: Role) {
    switch (r) {
        case "owner":
            return "Proprio";
        case "admin":
            return "Admin";
        case "editor":
            return "Éditeur";
        case "player":
            return "Joueur";
        default:
            return "Lecteur";
    }
}

function CreateWorldDialog({
    disabled,
    plan,
    hint,
}: {
    disabled?: boolean;
    plan: "free" | "pro" | "team" | "lifetime";
    hint: string;
}) {
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    async function handleCreate(formData: FormData) {
        const name = String(formData.get("name") || "").trim();
        const description = String(formData.get("description") || "").trim();
        if (!name) return;

        startTransition(async () => {
            const supabase = createClient();
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from("worlds")
                .insert({ owner_id: user.id, name, description })
                .select("id")
                .single();

            if (!error && data?.id) {
                setOpen(false);
                router.push(`/worlds/${data.id}`);
            } else {
                // Option: toaster d’erreur
                console.error(error);
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" disabled={disabled} title={hint}>
                    <Plus className="mr-1 h-4 w-4" />
                    Nouveau
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Nouveau monde</DialogTitle>
                </DialogHeader>

                {plan === "free" && disabled ? (
                    <div className="rounded-md bg-muted p-3 text-sm">
                        Ton quota gratuit est atteint. Passe à un plan supérieur
                        pour créer plus de mondes.
                    </div>
                ) : (
                    <form
                        action={handleCreate}
                        className="grid gap-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const fd = new FormData(
                                e.currentTarget as HTMLFormElement
                            );
                            handleCreate(fd);
                        }}
                    >
                        <div className="grid gap-1.5">
                            <Label htmlFor="name">Nom du monde</Label>
                            <Input
                                id="name"
                                name="name"
                                placeholder="Ex. Avalonia"
                                required
                            />
                        </div>

                        <div className="grid gap-1.5">
                            <Label htmlFor="description">Description</Label>
                            <Input
                                id="description"
                                name="description"
                                placeholder="Optionnel"
                            />
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                            >
                                Annuler
                            </Button>
                            <Button type="submit" disabled={pending}>
                                {pending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Créer
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
