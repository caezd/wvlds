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
import type { WorldUnreadRow, AppNotification, NotificationType, NotificationPreference } from "@/types/db";
import { useCurrentUser } from "@/hooks/useCurrentUser";

type AllChatroomUnreadRow = { chat_id: string; world_id: string; unread_messages: number };
type NotifPrefs = Partial<Record<NotificationType, boolean>>;

const NOTIF_INIT = 20;
const NOTIF_MORE = 10;

type Ctx = {
    worldUnread: Record<string, number>;
    roomUnread: Record<string, number>;
    setActiveChat: (id: string | null) => void;
    markWorldSeen: (worldId: string) => Promise<void>;
    refreshAll: () => Promise<void>;
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

    // Source de vérité unique : toujours la DB.
    const refreshAll = useCallback(async () => {
        const uid = userIdRef.current;
        if (!uid) return;

        const [{ data: worldRows }, { data: roomRows }] = await Promise.all([
            supabase.rpc(RPC.GET_WORLD_UNREADS),
            supabase.rpc("get_all_chatroom_unreads"),
        ]);

        const wMap: Record<string, number> = {};
        for (const r of (worldRows ?? []) as WorldUnreadRow[]) {
            wMap[r.world_id] = (r.unread_messages ?? 0) + (r.unread_rooms ?? 0);
        }
        setWorldUnread(wMap);

        const rMap: Record<string, number> = {};
        for (const r of (roomRows ?? []) as AllChatroomUnreadRow[]) {
            rMap[r.chat_id] = r.unread_messages ?? 0;
        }
        setRoomUnread(rMap);
    }, [supabase]);

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
        if (id) void markChatRead(id);
    }, [markChatRead]);

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
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: now } : n));
        await supabase
            .from(TABLE.NOTIFICATIONS)
            .update({ read_at: now })
            .eq("id", id);
    }, [supabase]);

    const markAllNotifsRead = useCallback(async () => {
        const now = new Date().toISOString();
        setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }));
        await supabase
            .from(TABLE.NOTIFICATIONS)
            .update({ read_at: now })
            .is("read_at", null);
    }, [supabase]);

    const archiveNotif = useCallback(async (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
        // Décrémenter l'offset pour que le prochain loadMore reste cohérent
        notifOffsetRef.current = Math.max(0, notifOffsetRef.current - 1);
        await supabase
            .from(TABLE.NOTIFICATIONS)
            .update({ archived_at: new Date().toISOString() })
            .eq("id", id);
    }, [supabase]);

    const loadMoreNotifs = useCallback(async () => {
        if (!hasMoreNotifs || isLoadingMoreRef.current) return;
        isLoadingMoreRef.current = true;
        const offset = notifOffsetRef.current;
        const { data } = await supabase
            .from(TABLE.NOTIFICATIONS)
            .select("*")
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
            const [{ data: mw }, { data: notifRows }, { data: prefRows }] = await Promise.all([
                supabase.from(TABLE.WORLD_MEMBERS).select("world_id").eq("user_id", userId),
                supabase
                    .from(TABLE.NOTIFICATIONS)
                    .select("*")
                    .is("archived_at", null)
                    .order("updated_at", { ascending: false })
                    .limit(NOTIF_INIT),
                supabase
                    .from(TABLE.NOTIFICATION_PREFERENCES)
                    .select("type, enabled"),
            ]);
            if (!mounted) return;

            if (notifRows) {
                setNotifications(notifRows as AppNotification[]);
                notifOffsetRef.current = notifRows.length;
                setHasMoreNotifs(notifRows.length === NOTIF_INIT);
            }
            if (prefRows) {
                const prefs: NotifPrefs = {};
                for (const p of prefRows as NotificationPreference[]) {
                    prefs[p.type] = p.enabled;
                }
                setNotifPrefs(prefs);
            }

            const worldIds = (mw ?? []).map((x: { world_id: string }) => x.world_id);
            await refreshAll();
            if (!mounted) return;

            if (activeChatRef.current) {
                await markChatRead(activeChatRef.current);
                if (!mounted) return;
            }

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
                    (payload: { new: Record<string, unknown> }) => {
                        const notif = payload.new as AppNotification;
                        setNotifications(prev => [notif, ...prev]);
                        notifOffsetRef.current += 1;
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
                    (payload: { new: Record<string, unknown> }) => {
                        const updated = payload.new as AppNotification;
                        // Ignorer les notifications archivées (ex: suppression via bouton ×)
                        if (updated.archived_at) return;
                        setNotifications(prev =>
                            [updated, ...prev.filter(n => n.id !== updated.id)],
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
    }), [worldUnread, roomUnread, setActiveChat, markWorldSeen, refreshAll,
        notifications, markNotifRead, markAllNotifsRead, archiveNotif,
        hasMoreNotifs, loadMoreNotifs, notifPrefs, setNotifPref]);

    return (
        <NotificationsCtx.Provider value={value}>
            {children}
        </NotificationsCtx.Provider>
    );
}
