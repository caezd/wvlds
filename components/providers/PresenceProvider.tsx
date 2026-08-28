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
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { channel, PRESENCE, TABLE } from "@/lib/constants";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import {
    derivePresenceStatus,
    resetPresenceStatuses,
    setPresenceStatuses,
    type GlobalPresenceMeta,
} from "@/lib/presenceStore";

export type PresenceStatus = "online" | "offline" | "invisible";

export type { GlobalPresenceMeta };
// `useUserPresence` — abonnement à la présence d'UN utilisateur, sans se
// re-rendre à chaque mouvement de présence de l'application. À préférer à
// `useGlobalPresence().getUserPresence(uid)` dans les composants nombreux
// (bulles de message, lignes de liste). Voir lib/presenceStore.ts.
export { useUserPresence } from "@/lib/presenceStore";

type Ctx = {
    /** Utilisateurs visibles : "en ligne" ou "absent" (dans la fenêtre PRESENCE.OFFLINE_WINDOW_MS) */
    onlineUsers: Record<string, GlobalPresenceMeta>;
    isUserOnline: (userId?: string | null) => boolean;
    /** Retourne le statut fin-grain d'un utilisateur : "online" | "away" | "offline" */
    getUserPresence: (userId?: string | null) => "online" | "away" | "offline";
    status: PresenceStatus;
    /** Mode invisible : ne publie ni présence realtime ni last_seen_at */
    appearOffline: boolean;
    setAppearOffline: (value: boolean) => Promise<boolean>;
    /** Retourne `false` si l'enregistrement a échoué (déjà signalé via toast.error). */
    setStatus: (status: PresenceStatus) => Promise<boolean>;
};

const PresenceCtx = createContext<Ctx | null>(null);

const DEFAULT_CTX: Ctx = {
    onlineUsers: {},
    isUserOnline: () => false,
    getUserPresence: () => "offline",
    status: "online",
    appearOffline: false,
    setAppearOffline: async () => false,
    setStatus: async () => false,
};

export function useGlobalPresence() {
    return useContext(PresenceCtx) ?? DEFAULT_CTX;
}

const getPresenceStatus = derivePresenceStatus;

function isVisible(meta: GlobalPresenceMeta) {
    return getPresenceStatus(meta) !== "offline";
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
    const { userId, username, avatarUrl, appearOffline: ctxAppearOffline } = useCurrentUser();
    const reconnectEpoch = useReconnectEpoch();

    const [onlineUsers, setOnlineUsers] = useState<Record<string, GlobalPresenceMeta>>({});
    const [status, setStatusState] = useState<PresenceStatus>("online");
    const [appearOffline, setAppearOfflineState] = useState(false);
    const appearOfflineRef = useRef(false);

    // Profil courant issu du contexte (résolu une seule fois, idéalement côté
    // serveur). Via un ref pour alimenter le payload de présence sans relancer
    // l'abonnement realtime (le canal reste keyé sur userId).
    const selfRef = useRef({ username, avatarUrl, appearOffline: ctxAppearOffline });
    useEffect(() => {
        selfRef.current = { username, avatarUrl, appearOffline: ctxAppearOffline };
    }, [username, avatarUrl, ctxAppearOffline]);

    // État brut du canal de présence (connectés en ce moment)
    const rawRef = useRef<Record<string, GlobalPresenceMeta>>({});
    // Partis du canal (reload, coupure réseau) mais encore dans la fenêtre
    // d'activité : évite le clignotement de la pastille à chaque navigation
    const lingeringRef = useRef<Record<string, GlobalPresenceMeta>>({});

    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const trackRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
    // Horodatage de la dernière vraie interaction utilisateur (distinct de lastTrack).
    // track() utilise cette valeur pour last_active_at même lors des reconnexions,
    // évitant de remettre le timer à zéro à chaque reconnexion WebSocket.
    const lastActivityAtRef = useRef<number>(Date.now());

    const recompute = useCallback(() => {
        for (const [uid, meta] of Object.entries(lingeringRef.current)) {
            if (!isVisible(meta)) delete lingeringRef.current[uid];
        }
        const next: Record<string, GlobalPresenceMeta> = {};
        for (const source of [lingeringRef.current, rawRef.current]) {
            for (const [uid, meta] of Object.entries(source)) {
                if (isVisible(meta)) next[uid] = meta;
            }
        }
        // Alimente le store par tranche : les abonnés de `useUserPresence(uid)`
        // ne seront réveillés que si le statut de LEUR utilisateur a bougé.
        setPresenceStatuses(next);
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

    // Le store est un singleton de module : on le vide au démontage pour ne pas
    // laisser des statuts périmés à un prochain montage (changement de compte).
    useEffect(() => resetPresenceStatuses, []);

    useEffect(() => {
        if (!userId) return;

        let mounted = true;
        let lastTrack = 0;

        const track = async (force = false) => {
            const ch = channelRef.current;
            if (!ch || !mounted) return;
            if (appearOfflineRef.current) return;
            const now = Date.now();
            if (!force && now - lastTrack < PRESENCE.HEARTBEAT_MS) return;
            lastTrack = now;
            // On utilise la dernière vraie activité utilisateur, pas now().
            // Ainsi, une reconnexion WebSocket (subscribe → force=true) ne remet
            // pas le timer à zéro si l'utilisateur est inactif depuis longtemps.
            const iso = new Date(lastActivityAtRef.current).toISOString();
            // Lecture du profil le plus récent : si l'identité arrive après le
            // montage (login client, initialUser=null), le payload reste à jour.
            await ch.track({
                user_id: userId,
                username: selfRef.current.username,
                avatar_url: selfRef.current.avatarUrl,
                last_active_at: iso,
            });
            // Heartbeat persistant : alimente le "vu il y a X" des profils.
            // Seule écriture de l'application dont on ignore délibérément
            // l'erreur : elle se répète à chaque battement, donc un échec
            // ponctuel se rattrape de lui-même au suivant, et journaliser
            // chaque tentative ratée noierait la console pendant une coupure
            // réseau. Le "vu il y a X" est au demeurant purement indicatif.
            void supabase
                .from(TABLE.PROFILES)
                .update({ last_seen_at: iso })
                .eq("id", userId);
        };
        trackRef.current = track;

        (async () => {
            // Profil déjà résolu par le contexte → plus de select profiles ici.
            appearOfflineRef.current = selfRef.current.appearOffline;
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
                    if (!nextRaw[uid] && isVisible(meta) && !hiddenSelf) {
                        lingeringRef.current[uid] = meta;
                    }
                }
                for (const uid of Object.keys(nextRaw)) {
                    delete lingeringRef.current[uid];
                }
                rawRef.current = nextRaw;
                recompute();
            });

            // "join" s'assure qu'un utilisateur apparaissant en ligne est
            // immédiatement reflété même si "sync" est retardé (reconnexion WS, etc.)
            ch.on("presence", { event: "join" }, ({ key, newPresences }: { key: string; newPresences: GlobalPresenceMeta[] }) => {
                if (!newPresences.length) return;
                let latest = newPresences[0];
                for (const p of newPresences.slice(1)) {
                    if ((p.last_active_at ?? "") > (latest.last_active_at ?? "")) latest = p;
                }
                delete lingeringRef.current[key];
                rawRef.current[key] = latest;
                recompute();
            });

            ch.subscribe(async (status: string) => {
                if (status !== "SUBSCRIBED") return;
                await track(true);
            });
        })();

        // Toute interaction rafraîchit last_active_at (throttlé par HEARTBEAT_MS)
        const onActivity = () => {
            lastActivityAtRef.current = Date.now();
            void track();
        };
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
            if (document.visibilityState === "visible") {
                lastActivityAtRef.current = Date.now();
                void track();
            }
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
        // reconnectEpoch : force la recréation du canal après une coupure
        // réseau (voir useReconnectEpoch), au lieu de compter sur la
        // reconnexion interne — peu fiable — de la websocket Realtime.
    }, [userId, supabase, recompute, reconnectEpoch]);

    // Si le profil n'est pas seedé par le serveur (login client depuis
    // /auth/login, initialUser=null), `appear_offline` arrive APRÈS le montage,
    // une fois le canal déjà créé et la présence trackée. On applique alors le
    // vrai statut — sinon un utilisateur en mode invisible resterait visible
    // « en ligne » jusqu'au prochain reload. Pas d'écriture DB : la valeur vient
    // déjà de la base.
    useEffect(() => {
        if (!userId) return;
        if (ctxAppearOffline === appearOfflineRef.current) return;
        appearOfflineRef.current = ctxAppearOffline;
        setAppearOfflineState(ctxAppearOffline);
        setStatusState(ctxAppearOffline ? "offline" : "online");
        if (ctxAppearOffline) {
            void channelRef.current?.untrack();
            delete rawRef.current[userId];
            delete lingeringRef.current[userId];
            recompute();
        } else {
            void trackRef.current(true);
        }
    }, [ctxAppearOffline, userId, recompute]);

    const setAppearOffline = useCallback(
        async (value: boolean) => {
            const previous = appearOfflineRef.current;
            appearOfflineRef.current = value;
            setAppearOfflineState(value);
            if (!userId) return true;

            const { error } = await supabase
                .from(TABLE.PROFILES)
                .update({ appear_offline: value })
                .eq("id", userId);

            if (error) {
                // Rollback de la mise à jour optimiste — sans ça l'UI resterait
                // désynchronisée de la valeur réellement en base.
                appearOfflineRef.current = previous;
                setAppearOfflineState(previous);
                toast.error("Impossible d'enregistrer le statut.");
                return false;
            }

            if (value) {
                await channelRef.current?.untrack();
                delete rawRef.current[userId];
                delete lingeringRef.current[userId];
                recompute();
            } else {
                await trackRef.current(true);
            }
            return true;
        },
        [supabase, userId, recompute],
    );

    const setStatus = useCallback(
        async (next: PresenceStatus) => {
            const previous = status;
            setStatusState(next);
            // "offline" et "invisible" masquent tous les deux la présence réseau.
            // La distinction est uniquement locale (libellé + couleur).
            const ok = await setAppearOffline(next !== "online");
            if (!ok) setStatusState(previous);
            return ok;
        },
        [setAppearOffline, status],
    );

    const isUserOnline = useCallback(
        (uid?: string | null) => (uid ? !!onlineUsers[uid] : false),
        [onlineUsers],
    );

    const getUserPresence = useCallback(
        (uid?: string | null): "online" | "away" | "offline" => {
            if (!uid) return "offline";
            const meta = onlineUsers[uid];
            if (!meta) return "offline";
            return getPresenceStatus(meta);
        },
        [onlineUsers],
    );

    const value = useMemo<Ctx>(
        () => ({ onlineUsers, isUserOnline, getUserPresence, status, appearOffline, setAppearOffline, setStatus }),
        [onlineUsers, isUserOnline, getUserPresence, status, appearOffline, setAppearOffline, setStatus],
    );

    return <PresenceCtx.Provider value={value}>{children}</PresenceCtx.Provider>;
}
