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
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
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
    markChatRead: (chatId: string, lastReadAt?: string) => Promise<void>;
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
    markChatRead: async () => {},
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

    // ── Compteurs non-lus ───────────────────────────────────────────────────
    // Source de vérité : `roomUnread` (messages non lus par salle) et
    // `unreadRoomsByWorld` (salles jamais vues par monde). Le badge de monde
    // est DÉRIVÉ des deux — une seule vérité, pas de double comptage.
    // Les compteurs sont entretenus localement (incréments Realtime, remise à
    // zéro sur lecture) : aucune RPC en régime permanent. `refreshAll` ne sert
    // qu'au resync (retour d'onglet) pour rattraper une éventuelle dérive.
    const [roomUnread, setRoomUnread] = useState<Record<string, number>>({});
    const [unreadRoomsByWorld, setUnreadRoomsByWorld] = useState<Record<string, number>>({});
    // chat_id → world_id, pour attribuer les compteurs de salle à leur monde
    const roomWorldRef = useRef<Record<string, string>>({});

    const worldUnread = useMemo(() => {
        const map: Record<string, number> = {};
        for (const [wid, count] of Object.entries(unreadRoomsByWorld)) {
            if (count > 0) map[wid] = count;
        }
        for (const [chatId, count] of Object.entries(roomUnread)) {
            if (count <= 0) continue;
            const wid = roomWorldRef.current[chatId];
            if (!wid) continue;
            map[wid] = (map[wid] ?? 0) + count;
        }
        return map;
    }, [roomUnread, unreadRoomsByWorld]);

    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({});
    const [hasMoreNotifs, setHasMoreNotifs] = useState(false);

    // Refs pour éviter les stale closures (Realtime, loadMoreNotifs, setActiveChat).
    // Miroirs synchronisés PENDANT le rendu, pas dans un useEffect : les effets
    // passifs s'exécutent après le commit, laissant une fenêtre où un handler
    // (clic, Realtime) lirait une ref en retard d'un rendu — ex. setActiveChat
    // qui n'archive pas les notifications tout juste affichées.
    const notifOffsetRef = useRef(0);
    const isLoadingMoreRef = useRef(false);
    const notificationsRef = useRef<AppNotification[]>([]);
    notificationsRef.current = notifications;

    const { userId } = useCurrentUser();
    const userIdRef = useRef<string | null>(null);
    userIdRef.current = userId;
    const reconnectEpoch = useReconnectEpoch();

    const activeChatRef = useRef<string | null>(null);
    const lastSyncRef = useRef(0);
    const lastMarkReadRef = useRef<Record<string, number>>({});

    // Hydrate les compteurs depuis les lignes RPC — partagé entre le bootstrap
    // (`get_app_shell`) et le resync (`refreshAll`).
    const applyUnreads = useCallback((worldRows: WorldUnreadRow[], roomRows: AllChatroomUnreadRow[]) => {
        const rMap: Record<string, number> = {};
        for (const r of roomRows) {
            rMap[r.chat_id] = r.unread_messages ?? 0;
            roomWorldRef.current[r.chat_id] = r.world_id;
        }
        setRoomUnread(rMap);

        const nMap: Record<string, number> = {};
        for (const w of worldRows) {
            nMap[w.world_id] = w.unread_rooms ?? 0;
        }
        setUnreadRoomsByWorld(nMap);
    }, []);

    const refreshAll = useCallback(async () => {
        const uid = userIdRef.current;
        if (!uid) return;
        lastSyncRef.current = Date.now();

        const [{ data: worldRows }, { data: roomRows }] = await Promise.all([
            supabase.rpc(RPC.GET_WORLD_UNREADS),
            supabase.rpc("get_all_chatroom_unreads"),
        ]);

        applyUnreads((worldRows ?? []) as WorldUnreadRow[], (roomRows ?? []) as AllChatroomUnreadRow[]);
    }, [supabase, applyUnreads]);

    // Resync au retour sur l'onglet : les compteurs locaux peuvent dériver si
    // un autre appareil a lu des salles pendant que celui-ci était en veille.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== "visible") return;
            if (Date.now() - lastSyncRef.current < DELAY.UNREAD_RESYNC_MIN) return;
            void refreshAll();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [refreshAll]);

    const markChatRead = useCallback(async (chatId: string, lastReadAt?: string) => {
        const uid = userIdRef.current;
        if (!uid) return;
        // Badge remis à zéro immédiatement, la DB suit (throttlée).
        setRoomUnread(prev => (prev[chatId] ?? 0) === 0 ? prev : { ...prev, [chatId]: 0 });

        const now = Date.now();
        if (now - (lastMarkReadRef.current[chatId] ?? 0) < DELAY.MARK_READ_THROTTLE) return;
        lastMarkReadRef.current[chatId] = now;

        const { error } = await supabase.from(TABLE.CHATROOM_READS).upsert(
            { chat_id: chatId, user_id: uid, last_read_at: lastReadAt ?? new Date().toISOString() },
            { onConflict: "chat_id,user_id" },
        );
        if (error) console.error("markChatRead error:", error);
    }, [supabase]);

    const markWorldSeen = useCallback(async (worldId: string) => {
        const uid = userIdRef.current;
        if (!uid) return;
        setUnreadRoomsByWorld(prev => (prev[worldId] ?? 0) === 0 ? prev : { ...prev, [worldId]: 0 });
        await supabase.from(TABLE.WORLD_MEMBER_READS).upsert(
            { world_id: worldId, user_id: uid, last_seen_at: new Date().toISOString() },
            { onConflict: "world_id,user_id" },
        );
    }, [supabase]);

    // ── Notifications feed ──────────────────────────────────────────────────

    // Retrait optimiste du state + archivage DB — mutualisé entre markNotifRead,
    // archiveNotif, setActiveChat et le handler Realtime INSERT.
    const archiveNotifs = useCallback(async (ids: string[], alsoRead = false) => {
        if (ids.length === 0) return;
        const now = new Date().toISOString();
        const idSet = new Set(ids);
        setNotifications(prev => {
            const removed = prev.filter(n => idSet.has(n.id)).length;
            if (removed === 0) return prev;
            notifOffsetRef.current = Math.max(0, notifOffsetRef.current - removed);
            return prev.filter(n => !idSet.has(n.id));
        });
        await supabase
            .from(TABLE.NOTIFICATIONS)
            .update(alsoRead ? { read_at: now, archived_at: now } : { archived_at: now })
            .in("id", ids);
    }, [supabase]);

    const markNotifRead = useCallback((id: string) => archiveNotifs([id], true), [archiveNotifs]);
    const archiveNotif = useCallback((id: string) => archiveNotifs([id]), [archiveNotifs]);

    const setActiveChat = useCallback((id: string | null) => {
        activeChatRef.current = id;
        if (!id) return;
        // Les notifications liées à cette salle (chatroom_reply, mention…)
        // disparaissent dès l'entrée dans la salle.
        const ids = notificationsRef.current.filter(n => n.chat_id === id).map(n => n.id);
        void archiveNotifs(ids);
    }, [archiveNotifs]);

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
            lastSyncRef.current = Date.now();

            setNotifications(shell.notifications);
            notifOffsetRef.current = shell.notifications.length;
            setHasMoreNotifs(shell.notifications.length === NOTIF_INIT);

            const prefs: NotifPrefs = {};
            for (const p of shell.notification_preferences) {
                prefs[p.type] = p.enabled;
            }
            setNotifPrefs(prefs);

            applyUnreads(shell.world_unreads, shell.room_unreads);

            // Realtime : un SEUL canal pour les messages de tous les mondes
            // (un binding filtré par monde), au lieu d'un canal par monde.
            // Les compteurs sont incrémentés localement — aucune RPC ici.
            const msgCh = supabase.channel(channel.userMessages(userId));
            for (const wid of shell.world_ids) {
                msgCh.on(
                    "postgres_changes",
                    {
                        event: "INSERT",
                        schema: "public",
                        table: TABLE.CHAT_MESSAGES,
                        filter: `world_id=eq.${wid}`,
                    },
                    (payload: { new: Record<string, unknown> }) => {
                        const row = payload.new as { chat_id: string; author_id: string | null };
                        if (row.author_id === userIdRef.current) return;
                        if (activeChatRef.current === row.chat_id) {
                            void markChatRead(row.chat_id);
                            return;
                        }
                        roomWorldRef.current[row.chat_id] = wid;
                        setRoomUnread(prev => ({ ...prev, [row.chat_id]: (prev[row.chat_id] ?? 0) + 1 }));
                    },
                );
            }
            msgCh.subscribe();
            openChannels.push(msgCh);

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
                        const incoming = payload.new as { id: string; chat_id: string | null };
                        // Si la notification concerne le chatroom actuellement ouvert,
                        // on l'archive immédiatement sans l'afficher.
                        if (incoming.chat_id && activeChatRef.current === incoming.chat_id) {
                            void archiveNotifs([incoming.id]);
                            return;
                        }
                        const { data } = await supabase
                            .from(TABLE.NOTIFICATIONS)
                            .select(NOTIF_SELECT)
                            .eq("id", incoming.id)
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
            openChannels.forEach((ch) => supabase.removeChannel(ch));
        };
        // reconnectEpoch : force la recréation des canaux après une coupure
        // réseau (voir useReconnectEpoch).
    }, [userId, reconnectEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

    const value = useMemo<Ctx>(() => ({
        panelOpen, openPanel, closePanel, togglePanel,
        worldUnread,
        roomUnread,
        setActiveChat,
        markChatRead,
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
        worldUnread, roomUnread, setActiveChat, markChatRead, markWorldSeen, refreshAll,
        notifications, markNotifRead, markAllNotifsRead, archiveNotif,
        hasMoreNotifs, loadMoreNotifs, notifPrefs, setNotifPref]);

    return (
        <NotificationsCtx.Provider value={value}>
            {children}
        </NotificationsCtx.Provider>
    );
}
