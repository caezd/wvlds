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
import type { AppNotification, NotificationType, AllChatroomUnreadRow } from "@/types/db";
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
    // `neverOpenedRooms` (salles jamais ouvertes), toutes deux dérivées de
    // `chatroom_reads`. Le badge de monde est la somme des contributions de
    // ses salles.
    // Les compteurs sont entretenus localement (incréments Realtime, remise à
    // zéro sur lecture) : aucune RPC en régime permanent. `refreshAll` ne sert
    // qu'au resync (retour d'onglet) pour rattraper une éventuelle dérive.
    const [roomUnread, setRoomUnread] = useState<Record<string, number>>({});
    const [neverOpenedRooms, setNeverOpenedRooms] = useState<Set<string>>(() => new Set());
    // chat_id → world_id, pour attribuer les compteurs de salle à leur monde
    const roomWorldRef = useRef<Record<string, string>>({});

    const worldUnread = useMemo(() => {
        const map: Record<string, number> = {};
        const chatIds = new Set([...Object.keys(roomUnread), ...neverOpenedRooms]);
        for (const chatId of chatIds) {
            const wid = roomWorldRef.current[chatId];
            if (!wid) continue;
            // Une salle jamais ouverte pèse au moins 1 — c'est le signal
            // « nouvelle salle », seul moyen de voir une salle neuve encore
            // vide. max() et non somme : additionner les deux ferait afficher
            // 12 à une salle neuve de 11 messages.
            const n = Math.max(roomUnread[chatId] ?? 0, neverOpenedRooms.has(chatId) ? 1 : 0);
            if (n > 0) map[wid] = (map[wid] ?? 0) + n;
        }
        return map;
    }, [roomUnread, neverOpenedRooms]);

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
    // Écritures « lu » programmées par le throttle (queue de fenêtre).
    const pendingReadRef = useRef<Record<string, { timer: ReturnType<typeof setTimeout>; ts?: string }>>({});

    // Hydrate les compteurs depuis les lignes RPC — partagé entre le bootstrap
    // (`get_app_shell`) et le resync (`refreshAll`). Les deux salles et les
    // salles jamais ouvertes viennent de la même source (`chatroom_reads`).
    const applyUnreads = useCallback((roomRows: AllChatroomUnreadRow[]) => {
        const rMap: Record<string, number> = {};
        const never = new Set<string>();
        for (const r of roomRows) {
            rMap[r.chat_id] = r.unread_messages ?? 0;
            roomWorldRef.current[r.chat_id] = r.world_id;
            if (r.never_opened) never.add(r.chat_id);
        }
        setRoomUnread(rMap);
        setNeverOpenedRooms(never);
    }, []);

    const refreshAll = useCallback(async () => {
        const uid = userIdRef.current;
        if (!uid) return;
        lastSyncRef.current = Date.now();

        const { data: roomRows } = await supabase.rpc("get_all_chatroom_unreads");

        applyUnreads((roomRows ?? []) as AllChatroomUnreadRow[]);
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

    // Écriture réelle. `lastReadAt` absent ⇒ la RPC résout avec now() côté
    // SERVEUR : l'horloge du navigateur ne fait pas autorité face aux
    // `created_at` posés par le serveur (cf. migration 092).
    const writeChatRead = useCallback(async (chatId: string, lastReadAt?: string) => {
        lastMarkReadRef.current[chatId] = Date.now();
        const { error } = await supabase.rpc(RPC.MARK_CHATROOM_READ, {
            p_chat_id: chatId,
            p_last_read_at: lastReadAt ?? null,
        });
        if (error) console.error("markChatRead error:", error.message, error.details, error.hint, error.code);
    }, [supabase]);

    // Démontage avec des écritures encore en attente : on les envoie plutôt que
    // de les perdre (sans await — le provider s'en va). Mieux vaut une requête
    // qui n'aboutit peut-être pas qu'un non-lu ressuscité à coup sûr.
    useEffect(() => {
        const pending = pendingReadRef.current;
        return () => {
            for (const [chatId, p] of Object.entries(pending)) {
                clearTimeout(p.timer);
                void writeChatRead(chatId, p.ts);
            }
            pendingReadRef.current = {};
        };
    }, [writeChatRead]);

    const markChatRead = useCallback(async (chatId: string, lastReadAt?: string) => {
        const uid = userIdRef.current;
        if (!uid) return;
        // Badge remis à zéro immédiatement, la DB suit (throttlée).
        setRoomUnread(prev => (prev[chatId] ?? 0) === 0 ? prev : { ...prev, [chatId]: 0 });
        // Ouvrir la salle la fait sortir des « jamais ouvertes » : c'est
        // l'écriture sur chatroom_reads qui rendra `never_opened` faux côté DB.
        setNeverOpenedRooms(prev => {
            if (!prev.has(chatId)) return prev;
            const next = new Set(prev);
            next.delete(chatId);
            return next;
        });

        const elapsed = Date.now() - (lastMarkReadRef.current[chatId] ?? 0);
        if (elapsed >= DELAY.MARK_READ_THROTTLE) {
            await writeChatRead(chatId, lastReadAt);
            return;
        }

        // Dans la fenêtre : on PROGRAMME l'écriture pour la fin, au lieu de la
        // jeter. Sans cette queue, une rafale qui s'arrête pendant la fenêtre
        // laissait ses derniers messages non lus en base — badge à zéro à
        // l'écran, puis de retour au rechargement ou au resync d'onglet.
        // La position la plus récente gagne ; la RPC applique GREATEST, donc
        // un écrasement par une valeur plus ancienne est sans effet.
        const pending = pendingReadRef.current[chatId];
        if (pending) {
            pending.ts = lastReadAt;
            return;
        }
        pendingReadRef.current[chatId] = {
            ts: lastReadAt,
            timer: setTimeout(() => {
                const p = pendingReadRef.current[chatId];
                delete pendingReadRef.current[chatId];
                void writeChatRead(chatId, p?.ts);
            }, DELAY.MARK_READ_THROTTLE - elapsed),
        };
    }, [writeChatRead]);

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

            applyUnreads(shell.room_unreads);

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
        worldUnread, roomUnread, setActiveChat, markChatRead, refreshAll,
        notifications, markNotifRead, markAllNotifsRead, archiveNotif,
        hasMoreNotifs, loadMoreNotifs, notifPrefs, setNotifPref]);

    return (
        <NotificationsCtx.Provider value={value}>
            {children}
        </NotificationsCtx.Provider>
    );
}
