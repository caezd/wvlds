"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ArrowLeft, AtSign, Bell, CheckCheck, Globe, Hash, Loader2,
    MessageSquare, Settings, Smile, UserPlus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { supabaseThumb } from "@/lib/storage";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { WorldPreviewDialog } from "@/components/worlds/WorldPreviewDialog";
import { TABLE, RPC } from "@/lib/constants";
import type { AppNotification, NotificationType } from "@/types/db";
import { notifText, notifHref, compactTime } from "@/lib/notifHelpers";
import { useTranslations } from "next-intl";

// ── Constants ─────────────────────────────────────────────────────────────────

const NOTIF_ICONS: Record<NotificationType, React.ReactNode> = {
    mention: <AtSign size={13} />,
    reaction: <Smile size={13} />,
    new_member: <UserPlus size={13} />,
    new_chatroom: <Hash size={13} />,
    world_invite: <UserPlus size={13} />,
    chatroom_reply: <MessageSquare size={13} />,
    persona_new_chatroom: <Hash size={13} />,
    persona_reply: <MessageSquare size={13} />,
};

const ALL_TYPES: NotificationType[] = ["mention", "reaction", "new_member", "new_chatroom", "chatroom_reply", "persona_new_chatroom", "persona_reply"];
const WORLD_HEADER_TYPES: NotificationType[] = ["mention", "reaction", "new_chatroom", "persona_new_chatroom", "persona_reply"];
const PERSONA_NOTIF_TYPES: NotificationType[] = ["persona_new_chatroom", "persona_reply"];

// ── WorldInviteCard ───────────────────────────────────────────────────────────

function WorldInviteCard({ notif, onMarkRead }: { notif: AppNotification; onMarkRead: (id: string) => void }) {
    const t = useTranslations("notifications");
    const meta = notif.metadata ?? null;
    const worldIconUrl = meta?.icon_url ?? null;
    const prefetchedData = notif.content
        ? { name: notif.content, icon_url: meta?.icon_url ?? null, banner_url: meta?.banner_url ?? null, description: meta?.description ?? null }
        : null;
    const supabase = createClient(); // eslint-disable-line react-hooks/rules-of-hooks
    const [status, setStatus] = useState<"pending" | "accepted" | "declined" | "cancelled" | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [acting, setActing] = useState(false);
    const router = useRouter();
    const { closePanel } = useNotifications();

    useEffect(() => {
        if (!notif.world_id) return;
        supabase.from(TABLE.WORLD_INVITATIONS)
            .select("status, role")
            .eq("world_id", notif.world_id)
            .eq("invitee_id", notif.recipient_id)
            .maybeSingle()
            .then(({ data: inv }: { data: { status: string; role: string } | null }) => {
                setStatus(inv ? (inv.status as "pending" | "accepted" | "declined") : "cancelled");
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
    if (status === "accepted") return <p className="mt-2 text-[11px] text-muted-foreground">{t("invite.joined")}</p>;
    if (status === "declined") return <p className="mt-2 text-[11px] text-muted-foreground">{t("invite.declined")}</p>;
    if (status === "cancelled") return <p className="mt-2 text-[11px] text-muted-foreground">{t("invite.cancelled")}</p>;

    return (
        <>
            <div className="mt-2.5 flex items-center gap-3 min-w-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted min-w-0">
                    {worldIconUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={worldIconUrl} alt="" className="h-full w-full object-cover" />
                        : <Globe size={14} className="text-muted-foreground" />
                    }
                </span>
                <button onClick={() => setPreviewOpen(true)} className="flex-1 truncate text-left text-sm font-medium hover:underline">
                    {notif.content ?? t("invite.worldFallback")}
                </button>
                <Button size="sm" className="h-7 shrink-0 pl-3 text-xs" onClick={accept} disabled={acting}>
                    {t("invite.join")}
                </Button>
                <button onClick={decline} disabled={acting} aria-label={t("invite.decline")}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
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

// ── NotifAvatar ───────────────────────────────────────────────────────────────

function NotifAvatar({ avatarUrl, actorName, type, isUnread: _isUnread }: {
    avatarUrl: string | null | undefined;
    actorName: string | null;
    type: NotificationType;
    isUnread: boolean;
}) {
    const thumb = avatarUrl ? supabaseThumb(avatarUrl, 56) ?? avatarUrl : null;
    if (thumb) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={thumb} alt={actorName ?? ""} className="h-7 w-7 shrink-0 rounded-full object-cover" />;
    }
    const letter = actorName ? actorName[0].toUpperCase() : null;
    if (letter) {
        return (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                {letter}
            </span>
        );
    }
    return (
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px]")}>
            {NOTIF_ICONS[type]}
        </span>
    );
}

// ── NotificationItem ──────────────────────────────────────────────────────────

function NotificationItem({ notif, actorAvatarUrl, worldInfo, onRead, onClose, onArchive }: {
    notif: AppNotification;
    actorAvatarUrl: string | null | undefined;
    worldInfo?: { name: string; icon_url: string | null };
    onRead: (id: string) => void;
    onClose: () => void;
    onArchive: (id: string) => void;
}) {
    const t = useTranslations("notifications");
    const isInvite = notif.type === "world_invite";
    const href = isInvite ? null : notifHref(notif);
    const isUnread = !notif.read_at;
    const showWorldHeader = worldInfo && WORLD_HEADER_TYPES.includes(notif.type);
    const isPersonaNotif = PERSONA_NOTIF_TYPES.includes(notif.type) || !!notif.metadata?.persona_name;
    const avatarUrl = isPersonaNotif ? notif.metadata?.icon_url ?? null : actorAvatarUrl;

    const archiveBtn = (
        <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onArchive(notif.id); }}
            aria-label={t("archive")}
            className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground"
        >
            <X size={11} />
        </button>
    );

    const content = (
        <div className={cn("group relative min-w-0 overflow-hidden px-4 py-3 transition-colors rounded-xl", isUnread && "bg-background")}>
            {archiveBtn}
            <div className="flex items-start gap-3">
                <NotifAvatar avatarUrl={avatarUrl} actorName={notif.actor_name} type={notif.type} isUnread={isUnread} />
                <div className="flex-1 min-w-0 pr-4">
                    {showWorldHeader && (
                        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                            <span className="truncate">{worldInfo.name}</span>
                        </div>
                    )}
                    <p className={cn("text-sm leading-snug", isUnread ? "text-foreground" : "text-muted-foreground")}>
                        {notifText(notif, t)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/50">{compactTime(notif.updated_at ?? notif.created_at, t("text.dayAbbr"))}</p>
                </div>
            </div>
            {isInvite && <WorldInviteCard notif={notif} onMarkRead={onRead} />}
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

// ── 1. Panel content ──────────────────────────────────────────────────────────

export function NotificationInlinePanelContent() {
    const t = useTranslations("notifications");
    const [view, setView] = useState<"list" | "prefs">("list");
    const {
        notifications, unreadNotifCount,
        markNotifRead, markAllNotifsRead,
        archiveNotif, hasMoreNotifs, loadMoreNotifs,
        notifPrefs, setNotifPref,
        closePanel,
    } = useNotifications();

    const PREF_LABELS: Record<NotificationType, string> = {
        mention: t("prefs.mention"),
        reaction: t("prefs.reaction"),
        new_member: t("prefs.new_member"),
        new_chatroom: t("prefs.new_chatroom"),
        world_invite: t("prefs.world_invite"),
        chatroom_reply: t("prefs.chatroom_reply"),
        persona_new_chatroom: t("prefs.persona_new_chatroom"),
        persona_reply: t("prefs.persona_reply"),
    };

    const sentinelRef = useRef<HTMLDivElement>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(entries => {
            if (entries[0]?.isIntersecting && hasMoreNotifs && !loadingMore) {
                setLoadingMore(true);
                void loadMoreNotifs().finally(() => setLoadingMore(false));
            }
        }, { threshold: 0.1 });
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMoreNotifs, loadingMore, loadMoreNotifs]);

    const supabase = createClient(); // eslint-disable-line react-hooks/rules-of-hooks
    const [actorAvatars, setActorAvatars] = useState<Record<string, string | null>>({});

    useEffect(() => {
        const ids = [...new Set(notifications.map(n => n.actor_id).filter((id): id is string => !!id))];
        const missing = ids.filter(id => !(id in actorAvatars));
        if (missing.length === 0) return;
        void supabase.from("profiles").select("id, avatar_url").in("id", missing)
            .then(({ data }: { data: { id: string; avatar_url: string | null }[] | null }) => {
                if (!data) return;
                setActorAvatars(prev => {
                    const next = { ...prev };
                    for (const p of data) next[p.id] = p.avatar_url;
                    return next;
                });
            });
    }, [notifications]); // eslint-disable-line react-hooks/exhaustive-deps

    const iconBtn = "flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";

    return (
        <div className="flex h-full flex-col overflow-hidden py-1">
            {/* Header */}
            <div className="shrink-0 h-header-height flex items-center px-4 gap-2">
                {view === "prefs" && (
                    <button onClick={() => setView("list")} className={iconBtn} aria-label={t("back")}><ArrowLeft size={15} /></button>
                )}
                <span className="flex-1 font-bold">
                    {view === "prefs" ? t("preferences") : t("title")}
                </span>
                {view === "list" && unreadNotifCount > 0 && (
                    <button onClick={markAllNotifsRead} className={iconBtn} title={t("markAllRead")}>
                        <CheckCheck size={14} />
                    </button>
                )}
                {view === "list" && (
                    <button onClick={() => setView("prefs")} className={iconBtn} aria-label={t("preferences")}><Settings size={14} /></button>
                )}
                <button onClick={closePanel} className={iconBtn} aria-label={t("title")}><X size={15} /></button>
            </div>

            {/* Body */}
            {view === "prefs" ? (
                <div className="flex flex-col">
                    {ALL_TYPES.map(type => (
                        <div key={type} className="flex items-center justify-between border-b border-border-soft px-4 py-3">
                            <div className="flex items-center gap-3 text-sm">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                    {NOTIF_ICONS[type]}
                                </span>
                                {PREF_LABELS[type]}
                            </div>
                            <Switch checked={notifPrefs[type] !== false} onCheckedChange={checked => setNotifPref(type, checked)} />
                        </div>
                    ))}
                </div>
            ) : notifications.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Bell size={32} className="opacity-20" />
                    <p className="text-sm">{t("empty")}</p>
                </div>
            ) : (
                <div className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-3 [scrollbar-width:thin]">
                    {notifications.map(n => (
                        <NotificationItem
                            key={n.id}
                            notif={n}
                            actorAvatarUrl={n.actor_id ? actorAvatars[n.actor_id] : null}
                            worldInfo={n.world ?? undefined}
                            onRead={markNotifRead}
                            onClose={closePanel}
                            onArchive={archiveNotif}
                        />
                    ))}
                    <div ref={sentinelRef} className="h-1 shrink-0" />
                    {loadingMore && (
                        <div className="flex justify-center py-2">
                            <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        </div>
                    )}
                    {!hasMoreNotifs && notifications.length > 0 && (
                        <p className="py-2 text-center text-[11px] text-muted-foreground/40">{t("allLoaded")}</p>
                    )}
                </div>
            )}
        </div>
    );
}

// ── 2. Bell button — icône dans le rail de la sidebar ─────────────────────────

export function NotificationBellButton() {
    const t = useTranslations("notifications");
    const { panelOpen, togglePanel, unreadNotifCount } = useNotifications();

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    onClick={togglePanel}
                    aria-label={t("title")}
                    aria-pressed={panelOpen}
                    className={cn(
                        "relative flex h-9 w-9 bg-carbon-800 items-center justify-center rounded-xl transition-colors",
                        panelOpen ? "text-accent bg-accent/10" : "hover:bg-muted hover:text-foreground",
                    )}
                >
                    <Bell size={17} />
                    {unreadNotifCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground px-0.5 shadow-[0_0_0_2px_hsl(var(--background))]">
                            {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                        </span>
                    )}
                </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>{t("title")}</TooltipContent>
        </Tooltip>
    );
}

// ── 3. Sidebar button — variante texte pour sidebar étendue ──────────────────

export function NotificationSidebarButton() {
    const t = useTranslations("notifications");
    const { panelOpen, togglePanel, unreadNotifCount } = useNotifications();

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={togglePanel}
            aria-pressed={panelOpen}
            className={cn(
                "w-full justify-start rounded-full border transition-colors",
                panelOpen
                    ? "border-[#333333] bg-[#1a1a1a] font-semibold text-foreground shadow-[0_1px_2px_0_rgba(128,128,128,0.1)]"
                    : "border-transparent hover:border-[#333333] hover:bg-transparent",
            )}
        >
            <Bell className="h-4 w-4 opacity-80 mr-1" />
            <span className="flex-1 truncate text-left">{t("title")}</span>
            {unreadNotifCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground px-1">
                    {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                </span>
            )}
        </Button>
    );
}
