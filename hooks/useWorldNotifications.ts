"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type RealtimeUnread = {
    unreadMessages: number;
    unreadRooms: number;
    bump: () => void; // force un refresh
};

export function useWorldRealtimeNotifications(
    worldId: string,
    currentUserId?: string,
    opts?: {
        onEvent?: (e: { type: "message" | "chatroom"; payload: any }) => void;
    }
): RealtimeUnread {
    const supabase = useMemo(() => createClient(), []);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [unreadRooms, setUnreadRooms] = useState(0);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    async function refreshFromServer() {
        if (!currentUserId) return;
        const { data } = await supabase.rpc("get_world_unreads", {
            u: currentUserId,
        });
        const row = (data ?? []).find((r: any) => r.world_id === worldId);
        setUnreadMessages(row?.unread_messages ?? 0);
        setUnreadRooms(row?.unread_rooms ?? 0);
    }

    // petite aide pour ne pas spammer le serveur
    function debouncedRefresh(delay = 400) {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            refreshFromServer();
        }, delay);
    }

    useEffect(() => {
        // initial: on prend la "vérité" serveur (ex: SSR/Sidebar a posé un état initial)
        refreshFromServer();

        // Canal unique pour ce world : messages
        const chMessages = supabase
            .channel(`world:${worldId}:messages`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "chat_messages",
                    filter: `world_id=eq.${worldId}`,
                },
                (payload) => {
                    const msg = payload.new as any;
                    // on ignore nos propres messages
                    if (currentUserId && msg.author_id === currentUserId)
                        return;

                    setUnreadMessages((n) => n + 1);
                    opts?.onEvent?.({ type: "message", payload });
                    debouncedRefresh();
                }
            )
            .subscribe();

        // Canal unique pour ce world : nouveaux salons
        const chRooms = supabase
            .channel(`world:${worldId}:rooms`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "chatrooms",
                    filter: `world_id=eq.${worldId}`,
                },
                (payload) => {
                    const room = payload.new as any;
                    if (currentUserId && room.created_by === currentUserId)
                        return;

                    setUnreadRooms((n) => n + 1);
                    opts?.onEvent?.({ type: "chatroom", payload });
                    debouncedRefresh();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(chMessages);
            supabase.removeChannel(chRooms);
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [worldId, currentUserId]);

    return {
        unreadMessages,
        unreadRooms,
        bump: refreshFromServer,
    };
}
