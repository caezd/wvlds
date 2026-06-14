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
import type { WorldUnreadRow } from "@/types/db";
import { useCurrentUser } from "@/hooks/useCurrentUser";

type AllChatroomUnreadRow = { chat_id: string; world_id: string; unread_messages: number };

type Ctx = {
    worldUnread: Record<string, number>;
    roomUnread: Record<string, number>;
    setActiveChat: (id: string | null) => void;
    markWorldSeen: (worldId: string) => Promise<void>;
    refreshAll: () => Promise<void>;
};

const NotificationsCtx = createContext<Ctx | null>(null);

const DEFAULT_CTX: Ctx = {
    worldUnread: {},
    roomUnread: {},
    setActiveChat: () => {},
    markWorldSeen: async () => {},
    refreshAll: async () => {},
};

export function useNotifications() {
    return useContext(NotificationsCtx) ?? DEFAULT_CTX;
}

export default function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const supabase = useMemo(() => createClient(), []);
    const [worldUnread, setWorldUnread] = useState<Record<string, number>>({});
    const [roomUnread, setRoomUnread] = useState<Record<string, number>>({});

    const { userId } = useCurrentUser();
    const userIdRef = useRef<string | null>(null);
    useEffect(() => { userIdRef.current = userId; }, [userId]);

    const activeChatRef = useRef<string | null>(null);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Source de vérité unique : toujours la DB.
    // Calcule world unreads depuis la somme des room unreads pour éviter la désynchronisation.
    const refreshAll = useCallback(async () => {
        const uid = userIdRef.current;
        if (!uid) return;

        const [{ data: worldRows }, { data: roomRows }] = await Promise.all([
            supabase.rpc(RPC.GET_WORLD_UNREADS),
            supabase.rpc("get_all_chatroom_unreads"),
        ]);

        // World-level : unread_messages (msgs) + unread_rooms (nouvelles chatrooms)
        const wMap: Record<string, number> = {};
        for (const r of (worldRows ?? []) as WorldUnreadRow[]) {
            wMap[r.world_id] = (r.unread_messages ?? 0) + (r.unread_rooms ?? 0);
        }
        setWorldUnread(wMap);

        // Room-level
        const rMap: Record<string, number> = {};
        for (const r of (roomRows ?? []) as AllChatroomUnreadRow[]) {
            rMap[r.chat_id] = r.unread_messages ?? 0;
        }
        setRoomUnread(rMap);
    }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

    // Refresh debounced — déclenché par les événements realtime
    const scheduleRefresh = useCallback(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => void refreshAll(), DELAY.NOTIFICATIONS_DEBOUNCE);
    }, [refreshAll]);

    // Marque une chatroom comme lue, puis déclenche un refresh
    const markChatRead = useCallback(async (chatId: string) => {
        const uid = userIdRef.current;
        if (!uid) return;
        await supabase.from(TABLE.CHATROOM_READS).upsert(
            { chat_id: chatId, user_id: uid, last_read_at: new Date().toISOString() },
            { onConflict: "chat_id,user_id" },
        );
        scheduleRefresh();
    }, [supabase, scheduleRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

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
    }, [supabase, scheduleRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

    // Bootstrap + realtime
    useEffect(() => {
        if (!userId) return;

        let mounted = true;
        const openChannels: ReturnType<typeof supabase.channel>[] = [];

        (async () => {
            // Charge les worlds membres
            const { data: mw } = await supabase
                .from(TABLE.WORLD_MEMBERS)
                .select("world_id")
                .eq("user_id", userId);
            if (!mounted) return;

            const worldIds = (mw ?? []).map((x: { world_id: string }) => x.world_id);

            await refreshAll();
            if (!mounted) return;

            // Si une chatroom était déjà active avant que userId soit connu
            if (activeChatRef.current) {
                await markChatRead(activeChatRef.current);
                if (!mounted) return;
            }

            // Abonnements realtime : un canal par monde (filtre world_id)
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
                        (payload) => {
                            const row = payload.new as { chat_id: string; author_id: string | null };
                            // Ignorer ses propres messages
                            if (row.author_id === userIdRef.current) return;
                            // Si l'user est dans cette chatroom : marquer comme lu
                            if (activeChatRef.current === row.chat_id) {
                                void markChatRead(row.chat_id);
                                return;
                            }
                            // Sinon : refresh debounced pour mettre à jour les badges
                            scheduleRefresh();
                        },
                    )
                    .subscribe();

                openChannels.push(ch);
            }
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
    }), [worldUnread, roomUnread, setActiveChat, markWorldSeen, refreshAll]);

    return (
        <NotificationsCtx.Provider value={value}>
            {children}
        </NotificationsCtx.Provider>
    );
}
