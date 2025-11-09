"use client";

import {
    createContext,
    use,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createClient } from "@/lib/supabase/client";

export type UnreadMap = Record<string, number>;

type Ctx = {
    unreadMap: UnreadMap;
    refresh: () => Promise<void>;
    markWorldRead: (worldId: string) => Promise<void>;
};

const WorldNotificationsContext = createContext<Ctx | null>(null);

export function useWorldNotifications() {
    const ctx = use(WorldNotificationsContext);
    if (!ctx) throw new Error("WorldNotificationsProvider missing");
    return ctx;
}

/**
 * Props:
 * - initialUnreadMap: map produit côté serveur (SSR) pour éviter tout flicker à l’hydratation
 */
export function WorldNotificationsProvider({
    children,
    initialUnreadMap = {},
}: {
    children: React.ReactNode;
    initialUnreadMap?: UnreadMap;
}) {
    const supabase = useMemo(() => createClient(), []);
    const [unreadMap, setUnreadMap] = useState<UnreadMap>(initialUnreadMap);
    const userIdRef = useRef<string | null>(null);
    const worldsRef = useRef<string[]>([]); // liste des worlds à écouter
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounce pour limiter les RPC
    const debounced = (fn: () => void, delay = 400) => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(fn, delay);
    };

    // Récupère les non-lus serveur et réconcilie
    async function refresh() {
        if (!userIdRef.current) return;
        const { data } = await supabase.rpc("get_world_unreads", {
            u: userIdRef.current,
        });
        const next: UnreadMap = {};
        for (const r of data ?? []) {
            next[r.world_id] = (r.unread_messages ?? 0) + (r.unread_rooms ?? 0);
        }
        setUnreadMap(next);
    }

    // Marquer un monde comme lu (utilisé par la page monde OU par la sidebar onClick)
    async function markWorldRead(worldId: string) {
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
        // Optimiste :
        setUnreadMap((m) => ({ ...m, [worldId]: 0 }));
        // Puis resync (utile si des events arrivent pendant)
        debounced(() => {
            refresh();
        });
    }

    // 1) Au mount: récupère user + mondes + unreads serveur
    useEffect(() => {
        let mounted = true;
        (async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!mounted) return;
            userIdRef.current = user?.id ?? null;
            if (!user?.id) return;

            // Mondes où je suis membre
            const { data: memberWorlds } = await supabase
                .from("world_members")
                .select("world_id")
                .eq("user_id", user.id);

            worldsRef.current = (memberWorlds ?? []).map((w) => w.world_id);
            await refresh();

            // Ouvre les canaux realtime (1 canal chat_messages + 1 canal chatrooms PAR monde)
            const messageChannels = worldsRef.current.map((wid) =>
                supabase
                    .channel(`w:${wid}:messages`)
                    .on(
                        "postgres_changes",
                        {
                            event: "INSERT",
                            schema: "public",
                            table: "chat_messages",
                            filter: `world_id=eq.${wid}`,
                        },
                        (payload) => {
                            const newRow: any = payload.new;
                            // ignorer mes propres messages
                            if (
                                userIdRef.current &&
                                newRow.author_id === userIdRef.current
                            )
                                return;
                            setUnreadMap((prev) => ({
                                ...prev,
                                [wid]: (prev[wid] ?? 0) + 1,
                            }));
                            debounced(refresh); // se recaler sur le serveur
                        }
                    )
                    .subscribe()
            );

            const roomChannels = worldsRef.current.map((wid) =>
                supabase
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
                            const newRow: any = payload.new;
                            if (
                                userIdRef.current &&
                                newRow.created_by === userIdRef.current
                            )
                                return;
                            setUnreadMap((prev) => ({
                                ...prev,
                                [wid]: (prev[wid] ?? 0) + 1,
                            }));
                            debounced(refresh);
                        }
                    )
                    .subscribe()
            );

            // (Optionnel) si tu veux réagir à l’ajout/retrait d’un monde, écoute world_members ici

            // Cleanup
            return () => {
                messageChannels.forEach((ch) => supabase.removeChannel(ch));
                roomChannels.forEach((ch) => supabase.removeChannel(ch));
                mounted = false;
                if (debounceTimer.current) clearTimeout(debounceTimer.current);
            };
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const value: Ctx = { unreadMap, refresh, markWorldRead };

    return (
        <WorldNotificationsContext.Provider value={value}>
            {children}
        </WorldNotificationsContext.Provider>
    );
}
