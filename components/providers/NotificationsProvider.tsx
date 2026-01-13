// components/notifications/NotificationsProvider.tsx
"use client";

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createClient } from "@/lib/supabase/client";

type Ctx = {
    worldUnread: Record<string, number>;
    roomUnread: Record<string, number>;
    setActiveWorld: (id: string | null) => void;
    setActiveChat: (id: string | null) => void;
    refreshAll: () => Promise<void>;
    refreshWorld: (worldId?: string) => Promise<void>;
    markWorldSeen: (worldId: string) => Promise<void>;
    markChatRead: (chatId: string) => Promise<void>;
};

const NotificationsCtx = createContext<Ctx | null>(null);

export function useNotifications() {
    const ctx = useContext(NotificationsCtx);
    if (!ctx) throw new Error("NotificationsProvider not mounted");
    return ctx;
}

export default function NotificationsProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = useMemo(() => createClient(), []);
    const [worldUnread, setWorldUnread] = useState<Record<string, number>>({});
    const [roomUnread, setRoomUnread] = useState<Record<string, number>>({});

    const userIdRef = useRef<string | null>(null);
    const memberWorldsRef = useRef<string[]>([]);
    const activeWorldRef = useRef<string | null>(null);
    const activeChatRef = useRef<string | null>(null);

    async function refreshAll() {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data: worlds } = await supabase.rpc("get_world_unreads", {
            u: user.id,
        });

        const wMap: Record<string, number> = {};
        for (const r of worlds ?? []) {
            const sum = (r.unread_messages ?? 0) + (r.unread_rooms ?? 0);
            wMap[r.world_id] = sum;
        }
        setWorldUnread(wMap);

        if (activeWorldRef.current) {
            await refreshWorld(activeWorldRef.current);
        }
    }

    async function refreshWorld(worldId?: string) {
        const wid = worldId ?? activeWorldRef.current;
        if (!wid) return;
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.rpc("get_chatroom_unreads", {
            u: user.id,
            wid,
        });
        const rMap: Record<string, number> = {};
        for (const r of data ?? []) rMap[r.chat_id] = r.unread_messages ?? 0;
        setRoomUnread((prev) => ({ ...prev, ...rMap }));
    }

    async function markWorldSeen(worldId: string) {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from("world_member_reads").upsert(
            {
                world_id: worldId,
                user_id: user.id,
                last_seen_at: new Date().toISOString(),
            },
            { onConflict: "world_id,user_id" }
        );
        setWorldUnread((m) => ({ ...m, [worldId]: 0 }));
        // on laisse roomUnread tel quel (les salons conservent leur état)
    }

    async function markChatRead(chatId: string) {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from("chatroom_reads").upsert(
            {
                chat_id: chatId,
                user_id: user.id,
                last_read_at: new Date().toISOString(),
            },
            { onConflict: "chat_id,user_id" }
        );

        setRoomUnread((m) => ({ ...m, [chatId]: 0 }));
        // recalcul côté monde (somme)
        const wid = activeWorldRef.current;
        if (wid) await refreshAll();
    }

    function setActiveWorld(id: string | null) {
        activeWorldRef.current = id;
        if (id) {
            void refreshWorld(id);
        }
    }

    function setActiveChat(id: string | null) {
        activeChatRef.current = id;
        if (id) {
            void markChatRead(id);
        }
    }

    // Bootstrap + realtime
    useEffect(() => {
        let mounted = true;
        (async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!mounted || !user) return;
            userIdRef.current = user.id;

            // Mondes où je suis membre
            const { data: mw } = await supabase
                .from("world_members")
                .select("world_id")
                .eq("user_id", user.id);
            const worldIds = (mw ?? []).map((x: any) => x.world_id);
            memberWorldsRef.current = worldIds;

            await refreshAll();

            // Realtime : un canal par monde pour messages + nouveaux salons
            const channels = worldIds.flatMap((wid) => {
                const ch1 = supabase
                    .channel(`w:${wid}:messages`)
                    .on(
                        "postgres_changes",
                        {
                            event: "INSERT",
                            schema: "public",
                            table: "chat_messages",
                            filter: `world_id=eq.${wid}`,
                        },
                        async (payload) => {
                            const row: any = payload.new;
                            if (row.author_id === userIdRef.current) return;

                            // Si je suis dans ce salon -> le marquer lu directement
                            if (activeChatRef.current === row.chat_id) {
                                await markChatRead(row.chat_id);
                                return;
                            }

                            // Incrémente salon
                            setRoomUnread((m) => ({
                                ...m,
                                [row.chat_id]: (m[row.chat_id] ?? 0) + 1,
                            }));
                            // Incrémente monde
                            setWorldUnread((m) => ({
                                ...m,
                                [wid]: (m[wid] ?? 0) + 1,
                            }));
                        }
                    )
                    .subscribe();

                const ch2 = supabase
                    .channel(`w:${wid}:rooms`)
                    .on(
                        "postgres_changes",
                        {
                            event: "INSERT",
                            schema: "public",
                            table: "chatrooms",
                            filter: `world_id=eq.${wid}`,
                        },
                        (payload) => {
                            const row: any = payload.new;
                            if (row.created_by === userIdRef.current) return;
                            // nouveau salon -> 1 notif sur ce salon (s’il est listé), + pastille monde
                            setRoomUnread((m) => ({
                                ...m,
                                [row.id]: (m[row.id] ?? 0) + 1,
                            }));
                            setWorldUnread((m) => ({
                                ...m,
                                [wid]: (m[wid] ?? 0) + 1,
                            }));
                        }
                    )
                    .subscribe();

                return [ch1, ch2];
            });

            return () => {
                channels.forEach((ch) => supabase.removeChannel(ch));
                mounted = false;
            };
        })();
    }, []); // eslint-disable-line

    const value: Ctx = {
        worldUnread,
        roomUnread,
        setActiveWorld,
        setActiveChat,
        refreshAll,
        refreshWorld,
        markWorldSeen,
        markChatRead,
    };

    return (
        <NotificationsCtx.Provider value={value}>
            {children}
        </NotificationsCtx.Provider>
    );
}
