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
import { channel, PRESENCE, TABLE } from "@/lib/constants";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export type PresenceStatus = "online" | "offline" | "invisible";

export type GlobalPresenceMeta = {
    user_id: string;
    username?: string | null;
    avatar_url?: string | null;
    last_active_at?: string | null;
};

type Ctx = {
    /** Utilisateurs ayant interagi avec l'app dans la fenêtre PRESENCE.ACTIVE_WINDOW_MS */
    onlineUsers: Record<string, GlobalPresenceMeta>;
    isUserOnline: (userId?: string | null) => boolean;
    status: PresenceStatus;
    /** Mode invisible : ne publie ni présence realtime ni last_seen_at */
    appearOffline: boolean;
    setAppearOffline: (value: boolean) => Promise<void>;
    setStatus: (status: PresenceStatus) => Promise<void>;
};

const PresenceCtx = createContext<Ctx | null>(null);

const DEFAULT_CTX: Ctx = {
    onlineUsers: {},
    isUserOnline: () => false,
    status: "online",
    appearOffline: false,
    setAppearOffline: async () => {},
    setStatus: async () => {},
};

export function useGlobalPresence() {
    return useContext(PresenceCtx) ?? DEFAULT_CTX;
}

function isActive(meta: GlobalPresenceMeta) {
    if (!meta.last_active_at) return false;
    const ts = Date.parse(meta.last_active_at);
    return Number.isFinite(ts) && Date.now() - ts < PRESENCE.ACTIVE_WINDOW_MS;
}

function parsePresenceState(
    state: Record<string, unknown>,
): Record<string, GlobalPresenceMeta> {
    const res: Record<string, GlobalPresenceMeta> = {};
    for (const [userId, entry] of Object.entries(state)) {
        const raw = entry as { metas?: GlobalPresenceMeta[] } | GlobalPresenceMeta[];
        const metas = (Array.isArray(raw) ? raw : (raw?.metas ?? [])) as GlobalPresenceMeta[];
        // Un meta par onglet ouvert : on retient l'activité la plus récente
        let latest: GlobalPresenceMeta | null = null;
        let latestTs = -Infinity;
        for (const m of metas) {
            const ts = m.last_active_at ? Date.parse(m.last_active_at) : -Infinity;
            if (!latest || ts >= latestTs) {
                latest = m;
                latestTs = ts;
            }
        }
        res[userId] = {
            user_id: userId,
            username: latest?.username ?? null,
            avatar_url: latest?.avatar_url ?? null,
            last_active_at: latest?.last_active_at ?? null,
        };
    }
    return res;
}

export default function PresenceProvider({ children }: { children: React.ReactNode }) {
    const supabase = useMemo(() => createClient(), []);
    const { userId } = useCurrentUser();

    const [onlineUsers, setOnlineUsers] = useState<Record<string, GlobalPresenceMeta>>({});
    const [status, setStatusState] = useState<PresenceStatus>("online");
    const [appearOffline, setAppearOfflineState] = useState(false);
    const appearOfflineRef = useRef(false);

    // État brut du canal de présence (connectés en ce moment)
    const rawRef = useRef<Record<string, GlobalPresenceMeta>>({});
    // Partis du canal (reload, coupure réseau) mais encore dans la fenêtre
    // d'activité : évite le clignotement de la pastille à chaque navigation
    const lingeringRef = useRef<Record<string, GlobalPresenceMeta>>({});

    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const trackRef = useRef<(force?: boolean) => Promise<void>>(async () => {});

    const recompute = useCallback(() => {
        for (const [uid, meta] of Object.entries(lingeringRef.current)) {
            if (!isActive(meta)) delete lingeringRef.current[uid];
        }
        const next: Record<string, GlobalPresenceMeta> = {};
        for (const source of [lingeringRef.current, rawRef.current]) {
            for (const [uid, meta] of Object.entries(source)) {
                if (isActive(meta)) next[uid] = meta;
            }
        }
        setOnlineUsers((prev) => {
            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(next);
            const same =
                prevKeys.length === nextKeys.length &&
                nextKeys.every(
                    (k) => prev[k]?.last_active_at === next[k]?.last_active_at,
                );
            return same ? prev : next;
        });
    }, []);

    useEffect(() => {
        if (!userId) return;

        let mounted = true;
        let lastTrack = 0;
        let profile: { username: string | null; avatar_url: string | null } = {
            username: null,
            avatar_url: null,
        };

        const track = async (force = false) => {
            const ch = channelRef.current;
            if (!ch || !mounted) return;
            if (appearOfflineRef.current) return;
            const now = Date.now();
            if (!force && now - lastTrack < PRESENCE.HEARTBEAT_MS) return;
            lastTrack = now;
            const iso = new Date(now).toISOString();
            await ch.track({
                user_id: userId,
                username: profile.username,
                avatar_url: profile.avatar_url,
                last_active_at: iso,
            });
            // Heartbeat persistant : alimente le "vu il y a X" des profils
            void supabase
                .from(TABLE.PROFILES)
                .update({ last_seen_at: iso })
                .eq("id", userId);
        };
        trackRef.current = track;

        (async () => {
            const { data } = await supabase
                .from(TABLE.PROFILES)
                .select("username, avatar_url, appear_offline")
                .eq("id", userId)
                .maybeSingle();
            if (!mounted) return;
            const row = data as unknown as {
                username?: string | null;
                avatar_url?: string | null;
                appear_offline?: boolean | null;
            } | null;
            profile = {
                username: row?.username ?? null,
                avatar_url: row?.avatar_url ?? null,
            };
            appearOfflineRef.current = !!row?.appear_offline;
            setAppearOfflineState(appearOfflineRef.current);
            setStatusState(appearOfflineRef.current ? "offline" : "online");

            const ch = supabase.channel(channel.appPresence(), {
                config: { presence: { key: userId } },
            });
            channelRef.current = ch;

            ch.on("presence", { event: "sync" }, () => {
                const nextRaw = parsePresenceState(ch.presenceState());
                // Ceux qui viennent de partir restent visibles jusqu'à
                // expiration de leur fenêtre d'activité (sauf soi-même en mode invisible)
                for (const [uid, meta] of Object.entries(rawRef.current)) {
                    const hiddenSelf = uid === userId && appearOfflineRef.current;
                    if (!nextRaw[uid] && isActive(meta) && !hiddenSelf) {
                        lingeringRef.current[uid] = meta;
                    }
                }
                for (const uid of Object.keys(nextRaw)) {
                    delete lingeringRef.current[uid];
                }
                rawRef.current = nextRaw;
                recompute();
            });

            ch.subscribe(async (status: string) => {
                if (status !== "SUBSCRIBED") return;
                await track(true);
            });
        })();

        // Toute interaction rafraîchit last_active_at (throttlé par HEARTBEAT_MS)
        const onActivity = () => void track();
        const events: (keyof WindowEventMap)[] = [
            "pointerdown",
            "keydown",
            "wheel",
            "touchstart",
            "focus",
        ];
        events.forEach((e) =>
            window.addEventListener(e, onActivity, { passive: true }),
        );
        const onVis = () => {
            if (document.visibilityState === "visible") void track();
        };
        document.addEventListener("visibilitychange", onVis);

        // Fait expirer les indicateurs des utilisateurs devenus inactifs
        const interval = window.setInterval(recompute, PRESENCE.REFRESH_MS);

        return () => {
            mounted = false;
            events.forEach((e) => window.removeEventListener(e, onActivity));
            document.removeEventListener("visibilitychange", onVis);
            window.clearInterval(interval);
            if (channelRef.current) {
                channelRef.current.untrack();
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
            rawRef.current = {};
            lingeringRef.current = {};
            setOnlineUsers({});
        };
    }, [userId, supabase, recompute]);

    const setAppearOffline = useCallback(
        async (value: boolean) => {
            appearOfflineRef.current = value;
            setAppearOfflineState(value);
            if (!userId) return;

            await supabase
                .from(TABLE.PROFILES)
                .update({ appear_offline: value })
                .eq("id", userId);

            if (value) {
                await channelRef.current?.untrack();
                delete rawRef.current[userId];
                delete lingeringRef.current[userId];
                recompute();
            } else {
                await trackRef.current(true);
            }
        },
        [supabase, userId, recompute],
    );

    const setStatus = useCallback(
        async (next: PresenceStatus) => {
            setStatusState(next);
            // "offline" et "invisible" masquent tous les deux la présence réseau.
            // La distinction est uniquement locale (libellé + couleur).
            await setAppearOffline(next !== "online");
        },
        [setAppearOffline],
    );

    const isUserOnline = useCallback(
        (uid?: string | null) => (uid ? !!onlineUsers[uid] : false),
        [onlineUsers],
    );

    const value = useMemo<Ctx>(
        () => ({ onlineUsers, isUserOnline, status, appearOffline, setAppearOffline, setStatus }),
        [onlineUsers, isUserOnline, status, appearOffline, setAppearOffline, setStatus],
    );

    return <PresenceCtx.Provider value={value}>{children}</PresenceCtx.Provider>;
}
