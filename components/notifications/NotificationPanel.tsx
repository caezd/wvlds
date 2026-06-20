"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Bell, CheckCheck, Settings, AtSign, Smile, UserPlus, Hash, ArrowLeft, X, Globe, Loader2, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { supabaseThumb } from "@/lib/storage";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { useNotifPanel } from "@/components/notifications/notif-panel-context";
import { WorldPreviewDialog } from "@/components/worlds/WorldPreviewDialog";
import { TABLE, RPC } from "@/lib/constants";
import type { AppNotification, NotificationType } from "@/types/db";
import { emojiFromContent, notifText, notifHref, compactTime } from "@/lib/notifHelpers";

const NOTIF_ICONS: Record<NotificationType, React.ReactNode> = {
    mention: <AtSign size={13} />,
    reaction: <Smile size={13} />,
    new_member: <UserPlus size={13} />,
    new_chatroom: <Hash size={13} />,
    world_invite: <UserPlus size={13} />,
    chatroom_reply: <MessageSquare size={13} />,
};

const PREF_LABELS: Record<NotificationType, string> = {
    mention: "Mentions",
    reaction: "Réactions",
    new_member: "Nouveaux membres",
    new_chatroom: "Nouvelles chatrooms",
    world_invite: "Invitations de monde",
    chatroom_reply: "Réponses dans mes chatrooms",
};

const ALL_TYPES: NotificationType[] = ["mention", "reaction", "new_member", "new_chatroom", "chatroom_reply"];

// ── WorldInviteCard — carte inline dans la notification ───────────────────────

function WorldInviteCard({
    notif,
    onMarkRead,
}: {
    notif: AppNotification;
    onMarkRead: (id: string) => void;
}) {
    const meta = notif.metadata ?? null;
    const worldIconUrl = meta?.icon_url ?? null;
    const prefetchedData = notif.content
        ? { name: notif.content, icon_url: meta?.icon_url ?? null, banner_url: meta?.banner_url ?? null, description: meta?.description ?? null }
        : null;
    const supabase = useMemo(() => createClient(), []);
    const [status, setStatus] = useState<'pending' | 'accepted' | 'declined' | 'cancelled' | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [acting, setActing] = useState(false);
    const router = useRouter();
    const { close: closePanel } = useNotifPanel();

    useEffect(() => {
        if (!notif.world_id) return;
        supabase.from(TABLE.WORLD_INVITATIONS)
            .select("status, role")
            .eq("world_id", notif.world_id)
            .eq("invitee_id", notif.recipient_id)
            .maybeSingle()
            .then(({ data: inv }: { data: { status: string; role: string } | null }) => {
                if (inv) { setStatus(inv.status as 'pending' | 'accepted' | 'declined'); }
                else setStatus('cancelled');
            });
    }, [notif.world_id, notif.recipient_id, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

    async function accept() {
        if (!notif.world_id || acting) return;
        setActing(true);
        const { error } = await supabase.rpc(RPC.ACCEPT_WORLD_INVITATION, { p_world_id: notif.world_id });
        if (!error) {
            setStatus("accepted");
            onMarkRead(notif.id);
            closePanel();
            router.push(`/w/${notif.world_id}`);
        }
        setActing(false);
    }

    async function decline() {
        if (!notif.world_id || acting) return;
        setActing(true);
        await supabase.from(TABLE.WORLD_INVITATIONS)
            .delete()
            .eq("world_id", notif.world_id)
            .eq("invitee_id", notif.recipient_id);
        setStatus("declined");
        onMarkRead(notif.id);
        setActing(false);
    }

    if (status === null) return null;

    if (status === 'accepted') {
        return <p className="mt-2 text-[11px] text-muted-foreground">Vous avez rejoint ce monde.</p>;
    }
    if (status === 'declined') {
        return <p className="mt-2 text-[11px] text-muted-foreground">Invitation refusée.</p>;
    }
    if (status === 'cancelled') {
        return <p className="mt-2 text-[11px] text-muted-foreground">Invitation annulée.</p>;
    }

    return (
        <>
            <div className="mt-2.5 flex items-center gap-3 min-w-0">
                {/* Icône monde */}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted min-w-0">
                    {worldIconUrl
                        ? <img src={worldIconUrl} alt="" className="h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                        : <Globe size={14} className="text-muted-foreground" />
                    }
                </span>
                {/* Nom du monde — cliquable */}
                <button
                    onClick={() => setPreviewOpen(true)}
                    className="flex-1 truncate text-left text-sm font-medium hover:underline"
                >
                    {notif.content ?? "Monde"}
                </button>
                {/* Actions */}
                <Button
                    size="sm"
                    className="h-7 shrink-0 pl-3 text-xs"
                    onClick={accept}
                    disabled={acting}
                >
                    Rejoindre
                </Button>
                <button
                    onClick={decline}
                    disabled={acting}
                    aria-label="Refuser"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                    <X size={14} />
                </button>
            </div>
            <WorldPreviewDialog
                worldId={notif.world_id}
                open={previewOpen}
                onOpenChange={setPreviewOpen}
                fallbackName={notif.content}
                prefetchedData={prefetchedData}
            />
        </>
    );
}

// ── NotificationItem ──────────────────────────────────────────────────────────

function NotifAvatar({
    avatarUrl,
    actorName,
    type,
    isUnread,
}: {
    avatarUrl: string | null | undefined;
    actorName: string | null;
    type: NotificationType;
    isUnread: boolean;
}) {
    const thumb = avatarUrl ? supabaseThumb(avatarUrl, 56) ?? avatarUrl : null;
    if (thumb) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={thumb}
                alt={actorName ?? ""}
                className="h-6 w-6 shrink-0 rounded-full object-cover"
            />
        );
    }
    const letter = actorName ? actorName[0].toUpperCase() : null;
    if (letter) {
        return (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                {letter}
            </span>
        );
    }
    return (
        <span className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px]",
        )}>
            {NOTIF_ICONS[type]}
        </span>
    );
}

const WORLD_HEADER_TYPES: NotificationType[] = ["mention", "reaction", "new_chatroom"];

function NotificationItem({
    notif,
    actorAvatarUrl,
    worldInfo,
    onRead,
    onClose,
    onArchive,
}: {
    notif: AppNotification;
    actorAvatarUrl: string | null | undefined;
    worldInfo?: { name: string; icon_url: string | null };
    onRead: (id: string) => void;
    onClose: () => void;
    onArchive: (id: string) => void;
}) {
    const isInvite = notif.type === "world_invite";
    const href = isInvite ? null : notifHref(notif);
    const isUnread = !notif.read_at;
    const showWorldHeader = worldInfo && WORLD_HEADER_TYPES.includes(notif.type);

    const archiveBtn = (
        <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onArchive(notif.id); }}
            aria-label="Supprimer la notification"
            className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground"
        >
            <X size={11} />
        </button>
    );

    const content = (
        <div className={cn(
            "group relative min-w-0 overflow-hidden px-4 py-3 transition-colors rounded-xl",
            isUnread && "bg-background",
        )}>
            {archiveBtn}
            <div className="flex items-start gap-3">
                <NotifAvatar
                    avatarUrl={actorAvatarUrl}
                    actorName={notif.actor_name}
                    type={notif.type}
                    isUnread={isUnread}
                />
                <div className="flex-1 min-w-0 pr-4">
                    {showWorldHeader && (
                        <div className="mt-1 mb-0.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                            <Globe size={12} />
                            <span className="truncate">{worldInfo.name}</span>
                        </div>
                    )}
                    <p className={cn(
                        "text-sm leading-snug",
                        isUnread ? "text-foreground" : "text-muted-foreground",
                    )}>
                        {notifText(notif)}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                        <p className="text-[11px] text-muted-foreground/50">
                            {compactTime(notif.updated_at ?? notif.created_at)}
                        </p>
                        {notif.type === "chatroom_reply" && (notif.metadata?.count ?? 0) > 1 && (
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                                {notif.metadata!.count}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            {isInvite && (
                <WorldInviteCard notif={notif} onMarkRead={onRead} />
            )}
        </div>
    );

    if (href) {
        return (
            <Link href={href} className="block" onClick={() => { onRead(notif.id); onClose(); }}>
                {content}
            </Link>
        );
    }
    return <div>{content}</div>;
}

// ── Inline panel content (rendu dans SidebarLayout) ───────────────────────────

export function NotificationInlinePanelContent({ onClose }: { onClose: () => void }) {
    const [view, setView] = useState<"list" | "prefs">("list");
    const {
        notifications, unreadNotifCount,
        markNotifRead, markAllNotifsRead,
        archiveNotif, hasMoreNotifs, loadMoreNotifs,
        notifPrefs, setNotifPref,
    } = useNotifications();

    const sentinelRef = useRef<HTMLDivElement>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && hasMoreNotifs && !loadingMore) {
                    setLoadingMore(true);
                    void loadMoreNotifs().finally(() => setLoadingMore(false));
                }
            },
            { threshold: 0.1 },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMoreNotifs, loadingMore, loadMoreNotifs]);

    const supabase = useMemo(() => createClient(), []);
    const [actorAvatars, setActorAvatars] = useState<Record<string, string | null>>({});
    const [worldData, setWorldData] = useState<Record<string, { name: string; icon_url: string | null }>>({});

    useEffect(() => {
        const ids = [...new Set(
            notifications.map(n => n.actor_id).filter((id): id is string => !!id)
        )];
        const missing = ids.filter(id => !(id in actorAvatars));
        if (missing.length === 0) return;

        supabase
            .from("profiles")
            .select("id, avatar_url")
            .in("id", missing)
            .then(({ data }: { data: { id: string; avatar_url: string | null }[] | null }) => {
                if (!data) return;
                setActorAvatars(prev => {
                    const next = { ...prev };
                    for (const p of data) {
                        next[p.id] = p.avatar_url;
                    }
                    return next;
                });
            });
    }, [notifications]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const ids = [...new Set(
            notifications
                .filter(n => WORLD_HEADER_TYPES.includes(n.type))
                .map(n => n.world_id)
                .filter((id): id is string => !!id)
        )];
        const missing = ids.filter(id => !(id in worldData));
        if (missing.length === 0) return;

        supabase
            .from("worlds")
            .select("id, name, icon_url")
            .in("id", missing)
            .then(({ data }: { data: { id: string; name: string; icon_url: string | null }[] | null }) => {
                if (!data) return;
                setWorldData(prev => {
                    const next = { ...prev };
                    for (const w of data) {
                        next[w.id] = { name: w.name, icon_url: w.icon_url };
                    }
                    return next;
                });
            });
    }, [notifications]); // eslint-disable-line react-hooks/exhaustive-deps

    const iconBtn = "flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";

    return (
        <div className="flex h-full flex-col overflow-hidden py-4">
            {/* Header */}
            <div className="shrink-0 border-b border-border-soft px-4  h-header-height flex items-center">
                {view === "prefs" ? (
                    <div className="flex items-center gap-2">
                        <button onClick={() => setView("list")} className={iconBtn} aria-label="Retour">
                            <ArrowLeft size={15} />
                        </button>
                        <span className="flex-1 text-sm font-bold">Préférences</span>
                        <button onClick={onClose} className={iconBtn} aria-label="Fermer">
                            <X size={15} />
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-1 items-center gap-2">
                            <span className="flex-1 text-sm font-bold">
                                Notifications
                            </span>
                            {unreadNotifCount > 0 && (
                                <button
                                    onClick={markAllNotifsRead}
                                    className={iconBtn}
                                    title="Tout marquer comme lu"
                                >
                                    <CheckCheck size={14} />
                                </button>
                            )}
                            <button onClick={() => setView("prefs")} className={iconBtn} aria-label="Préférences">
                                <Settings size={14} />
                            </button>
                            <button onClick={onClose} className={iconBtn} aria-label="Fermer">
                                <X size={15} />
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Body */}
            {view === "prefs" ? (
                <div className="flex flex-col">
                    {ALL_TYPES.map((type) => (
                        <div
                            key={type}
                            className="flex items-center justify-between border-b border-border-soft px-4 py-3"
                        >
                            <div className="flex items-center gap-3 text-sm">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                    {NOTIF_ICONS[type]}
                                </span>
                                {PREF_LABELS[type]}
                            </div>
                            <Switch
                                checked={notifPrefs[type] !== false}
                                onCheckedChange={(checked) => setNotifPref(type, checked)}
                            />
                        </div>
                    ))}
                </div>
            ) : notifications.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Bell size={32} className="opacity-20" />
                    <p className="text-sm">Aucune notification</p>
                </div>
            ) : (
                <div className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2 [scrollbar-width:thin]">
                    {notifications.map((n) => (
                        <NotificationItem
                            key={n.id}
                            notif={n}
                            actorAvatarUrl={n.actor_id ? actorAvatars[n.actor_id] : null}
                            worldInfo={n.world_id ? worldData[n.world_id] : undefined}
                            onRead={markNotifRead}
                            onClose={onClose}
                            onArchive={archiveNotif}
                        />
                    ))}
                    {/* Sentinel pour l'infinite scroll */}
                    <div ref={sentinelRef} className="h-1 shrink-0" />
                    {loadingMore && (
                        <div className="flex justify-center py-2">
                            <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        </div>
                    )}
                    {!hasMoreNotifs && notifications.length > 0 && (
                        <p className="py-2 text-center text-[11px] text-muted-foreground/40">
                            Toutes les notifications
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Rail variant — toggle le panneau inline ───────────────────────────────────

export function NotificationBellButton() {
    const { open, toggle } = useNotifPanel();
    const { unreadNotifCount } = useNotifications();

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    onClick={toggle}
                    aria-label="Notifications"
                    aria-pressed={open}
                    className={cn(
                        "relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
                        open
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border-soft bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                >
                    <Bell size={17} />
                    {unreadNotifCount > 0 && (
                        <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground px-0.5 shadow-[0_0_0_2px_hsl(var(--background))]">
                            {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                        </span>
                    )}
                </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>Notifications</TooltipContent>
        </Tooltip>
    );
}

// ── Sidebar variant — toggle le panneau inline ────────────────────────────────

export function NotificationSidebarButton() {
    const { open, toggle } = useNotifPanel();
    const { unreadNotifCount } = useNotifications();

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-pressed={open}
            className={cn(
                "w-full justify-start rounded-full border transition-colors",
                open
                    ? "border-[#333333] bg-[#1a1a1a] font-semibold text-foreground shadow-[0_1px_2px_0_rgba(128,128,128,0.1)]"
                    : "border-transparent hover:border-[#333333] hover:bg-transparent",
            )}
        >
            <Bell className="h-4 w-4 opacity-80 mr-1" />
            <span className="flex-1 truncate text-left">Notifications</span>
            {unreadNotifCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground px-1">
                    {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                </span>
            )}
        </Button>
    );
}
