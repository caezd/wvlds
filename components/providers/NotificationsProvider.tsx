"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { TABLE, RPC, channel, DELAY } from "@/lib/constants";
import type { WorldUnreadRow, AppNotification, NotificationType, AllChatroomUnreadRow } from "@/types/db";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { fetchAppShell } from "@/lib/appShell";

type NotifPrefs = Partial<Record<NotificationType, boolean>>;

const NOTIF_INIT = 20;
const NOTIF_MORE = 10;
const NOTIF_SELECT = "*, world:worlds!world_id(name, icon_url)";

type Ctx = {
    // Panel open/close
    panelOpen: boolean;
    openPanel: () => void;
    closePanel: () => void;
    togglePanel: () => void;
    // Unread counts
    worldUnread: Record<string, number>;
    roomUnread: Record<string, number>;
    setActiveChat: (id: string | null) => void;
    markWorldSeen: (worldId: string) => Promise<void>;
    refreshAll: () => Promise<void>;
    // Notifications feed
    notifications: AppNotification[];
    unreadNotifCount: number;
    markNotifRead: (id: string) => Promise<void>;
    markAllNotifsRead: () => Promise<void>;
    archiveNotif: (id: string) => Promise<void>;
    hasMoreNotifs: boolean;
    loadMoreNotifs: () => Promise<void>;
    notifPrefs: NotifPrefs;
    setNotifPref: (type: NotificationType, enabled: boolean) => Promise<void>;
};

const NotificationsCtx = createContext<Ctx | null>(null);

const DEFAULT_CTX: Ctx = {
    panelOpen: false,
    openPanel: () => {},
    closePanel: () => {},
    togglePanel: () => {},
    worldUnread: {},
    roomUnread: {},
    setActiveChat: () => {},
    markWorldSeen: async () => {},
    refreshAll: async () => {},
    notifications: [],
    unreadNotifCount: 0,
    markNotifRead: async () => {},
    markAllNotifsRead: async () => {},
    archiveNotif: async () => {},
    hasMoreNotifs: false,
    loadMoreNotifs: async () => {},
    notifPrefs: {},
    setNotifPref: async () => {},
};

export function useNotifications() {
    return useContext(NotificationsCtx) ?? DEFAULT_CTX;
}

export default function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const supabase = useMemo(() => createClient(), []);

    const [panelOpen, setPanelOpen] = useState(false);
    const openPanel  = useCallback(() => setPanelOpen(true),  []);
    const closePanel = useCallback(() => setPanelOpen(false), []);
    const togglePanel = useCallback(() => setPanelOpen(v => !v), []);

    const [worldUnread, setWorldUnread] = useState<Record<string, number>>({});
    const [roomUnread, setRoomUnread] = useState<Record<string, number>>({});
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({});
    const [hasMoreNotifs, setHasMoreNotifs] = useState(false);

    // Refs pour éviter les stale closures dans loadMoreNotifs
    const notifOffsetRef = useRef(0);
    const isLoadingMoreRef = useRef(false);

    const { userId } = useCurrentUser();
    const userIdRef = useRef<string | null>(null);
    useEffect(() => { userIdRef.current = userId; }, [userId]);

    const activeChatRef = useRef<string | null>(null);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Dérive les deux maps de badges non-lus à partir des lignes RPC — partagé
    // entre le refresh ciblé (`refreshAll`) et le bootstrap (`get_app_shell`).
    const applyUnreads = useCallback((worldRows: WorldUnreadRow[], roomRows: AllChatroomUnreadRow[]) => {
        const wMap: Record<string, number> = {};
        for (const r of worldRows) {
            wMap[r.world_id] = (r.unread_messages ?? 0) + (r.unread_rooms ?? 0);
        }
        setWorldUnread(wMap);

        const rMap: Record<string, number> = {};
        for (const r of roomRows) {
            rMap[r.chat_id] = r.unread_messages ?? 0;
        }
        setRoomUnread(rMap);
    }, []);

    // Source de vérité unique : toujours la DB. Utilisé pour les rafraîchissements
    // ciblés (après un événement Realtime) — le bootstrap initial passe par
    // get_app_shell() qui inclut déjà ces mêmes compteurs.
    const refreshAll = useCallback(async () => {
        const uid = userIdRef.current;
        if (!uid) return;

        const [{ data: worldRows }, { data: roomRows }] = await Promise.all([
            supabase.rpc(RPC.GET_WORLD_UNREADS),
            supabase.rpc("get_all_chatroom_unreads"),
        ]);

        applyUnreads((worldRows ?? []) as WorldUnreadRow[], (roomRows ?? []) as AllChatroomUnreadRow[]);
    }, [supabase, applyUnreads]);

    const scheduleRefresh = useCallback(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => void refreshAll(), DELAY.NOTIFICATIONS_DEBOUNCE);
    }, [refreshAll]);

    const markChatRead = useCallback(async (chatId: string) => {
        const uid = userIdRef.current;
        if (!uid) return;
        await supabase.from(TABLE.CHATROOM_READS).upsert(
            { chat_id: chatId, user_id: uid, last_read_at: new Date().toISOString() },
            { onConflict: "chat_id,user_id" },
        );
        scheduleRefresh();
    }, [supabase, scheduleRefresh]);

    const setActiveChat = useCallback((id: string | null) => {
        activeChatRef.current = id;
        // Le marquage « lu » est assuré par la vue chatroom (au mount, avec le
        // timestamp précis du dernier message). On évite ici un POST
        // chatroom_reads redondant — d'autant que `userId` est désormais résolu
        // dès le boot, ce qui ferait sinon partir ce doublon à chaque ouverture.
    }, []);

    const markWorldSeen = useCallback(async (worldId: string) => {
        const uid = userIdRef.current;
        if (!uid) return;
        await supabase.from(TABLE.WORLD_MEMBER_READS).upsert(
            { world_id: worldId, user_id: uid, last_seen_at: new Date().toISOString() },
            { onConflict: "world_id,user_id" },
        );
        scheduleRefresh();
    }, [supabase, scheduleRefresh]);

    // ── Notifications feed ──────────────────────────────────────────────────

    const markNotifRead = useCallback(async (id: string) => {
        const now = new Date().toISOString();
        const { error } = await supabase
            .from(TABLE.NOTIFICATIONS)
            .update({ read_at: now, archived_at: now })
            .eq("id", id);
        if (error) return;
        setNotifications(prev => prev.filter(n => n.id !== id));
        notifOffsetRef.current = Math.max(0, notifOffsetRef.current - 1);
    }, [supabase]);

    const markAllNotifsRead = useCallback(async () => {
        const now = new Date().toISOString();
        setNotifications([]);
        notifOffsetRef.current = 0;
        setHasMoreNotifs(false);
        await supabase
            .from(TABLE.NOTIFICATIONS)
            .update({ read_at: now, archived_at: now })
            .is("archived_at", null);
    }, [supabase]);

    const archiveNotif = useCallback(async (id: string) => {
        const { error } = await supabase
            .from(TABLE.NOTIFICATIONS)
            .update({ archived_at: new Date().toISOString() })
            .eq("id", id);
        if (error) return;
        setNotifications(prev => prev.filter(n => n.id !== id));
        notifOffsetRef.current = Math.max(0, notifOffsetRef.current - 1);
    }, [supabase]);

    const loadMoreNotifs = useCallback(async () => {
        if (!hasMoreNotifs || isLoadingMoreRef.current) return;
        isLoadingMoreRef.current = true;
        const offset = notifOffsetRef.current;
        const { data } = await supabase
            .from(TABLE.NOTIFICATIONS)
            .select(NOTIF_SELECT)
            .is("archived_at", null)
            .order("updated_at", { ascending: false })
            .range(offset, offset + NOTIF_MORE - 1);
        isLoadingMoreRef.current = false;
        if (!data || data.length === 0) {
            setHasMoreNotifs(false);
            return;
        }
        setNotifications(prev => [...prev, ...(data as AppNotification[])]);
        notifOffsetRef.current += data.length;
        if (data.length < NOTIF_MORE) setHasMoreNotifs(false);
    }, [supabase, hasMoreNotifs]);

    const setNotifPref = useCallback(async (type: NotificationType, enabled: boolean) => {
        const uid = userIdRef.current;
        if (!uid) return;
        setNotifPrefs(prev => ({ ...prev, [type]: enabled }));
        await supabase
            .from(TABLE.NOTIFICATION_PREFERENCES)
            .upsert({ user_id: uid, type, enabled }, { onConflict: "user_id,type" });
    }, [supabase]);

    // ── Bootstrap + realtime ────────────────────────────────────────────────
    useEffect(() => {
        if (!userId) return;

        let mounted = true;
        const openChannels: ReturnType<typeof supabase.channel>[] = [];

        (async () => {
            // Un seul aller-retour réseau : world_members + notifications +
            // notification_preferences + les deux compteurs non-lus sont fusionnés
            // dans get_app_shell() (partagée avec DmsProvider, qui monte en parallèle).
            const shell = await fetchAppShell(supabase, userId, NOTIF_INIT);
            if (!mounted) return;

            setNotifications(shell.notifications);
            notifOffsetRef.current = shell.notifications.length;
            setHasMoreNotifs(shell.notifications.length === NOTIF_INIT);

            const prefs: NotifPrefs = {};
            for (const p of shell.notification_preferences) {
                prefs[p.type] = p.enabled;
            }
            setNotifPrefs(prefs);

            applyUnreads(shell.world_unreads, shell.room_unreads);

            const worldIds = shell.world_ids;

            // Realtime : messages par monde (pour les badges non-lus)
            for (const wid of worldIds) {
                const ch = supabase
                    .channel(channel.worldMessages(wid))
                    .on(
                        "postgres_changes",
                        {
                            event: "INSERT",
                            schema: "public",
                            table: TABLE.CHAT_MESSAGES,
                            filter: `world_id=eq.${wid}`,
                        },
                        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
                            const row = payload.new as { chat_id: string; author_id: string | null };
                            if (row.author_id === userIdRef.current) return;
                            if (activeChatRef.current === row.chat_id) {
                                void markChatRead(row.chat_id);
                                return;
                            }
                            scheduleRefresh();
                        },
                    )
                    .subscribe();
                openChannels.push(ch);
            }

            // Realtime : nouvelles notifications + mises à jour agrégées (chatroom_reply)
            const notifCh = supabase
                .channel(channel.userNotifs(userId))
                .on(
                    "postgres_changes",
                    {
                        event: "INSERT",
                        schema: "public",
                        table: TABLE.NOTIFICATIONS,
                        filter: `recipient_id=eq.${userId}`,
                    },
                    async (payload: { new: Record<string, unknown> }) => {
                        const id = payload.new.id as string;
                        const { data } = await supabase
                            .from(TABLE.NOTIFICATIONS)
                            .select(NOTIF_SELECT)
                            .eq("id", id)
                            .single();
                        if (!data) return;
                        setNotifications(prev => {
                            if (prev.some(n => n.id === data.id)) return prev;
                            notifOffsetRef.current += 1;
                            return [data as AppNotification, ...prev];
                        });
                    },
                )
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: TABLE.NOTIFICATIONS,
                        filter: `recipient_id=eq.${userId}`,
                    },
                    async (payload: { new: Record<string, unknown> }) => {
                        const updated = payload.new as AppNotification;
                        if (updated.archived_at) return;
                        const id = updated.id;
                        const { data } = await supabase
                            .from(TABLE.NOTIFICATIONS)
                            .select(NOTIF_SELECT)
                            .eq("id", id)
                            .single();
                        if (!data) return;
                        setNotifications(prev =>
                            [data as AppNotification, ...prev.filter(n => n.id !== id)],
                        );
                    },
                )
                .subscribe();
            openChannels.push(notifCh);
        })();

        return () => {
            mounted = false;
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            openChannels.forEach((ch) => supabase.removeChannel(ch));
        };
    }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

    const value = useMemo<Ctx>(() => ({
        panelOpen, openPanel, closePanel, togglePanel,
        worldUnread,
        roomUnread,
        setActiveChat,
        markWorldSeen,
        refreshAll,
        notifications,
        unreadNotifCount: notifications.filter(n => !n.read_at).length,
        markNotifRead,
        markAllNotifsRead,
        archiveNotif,
        hasMoreNotifs,
        loadMoreNotifs,
        notifPrefs,
        setNotifPref,
    }), [panelOpen, openPanel, closePanel, togglePanel,
        worldUnread, roomUnread, setActiveChat, markWorldSeen, refreshAll,
        notifications, markNotifRead, markAllNotifsRead, archiveNotif,
        hasMoreNotifs, loadMoreNotifs, notifPrefs, setNotifPref]);

    return (
        <NotificationsCtx.Provider value={value}>
            {children}
        </NotificationsCtx.Provider>
    );
}
