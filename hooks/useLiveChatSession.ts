"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { TABLE } from "@/lib/constants";
import { topic, useTopic } from "@/lib/realtimeHub";
import {
  LIVE_CHAT_CONNECTION_FIELDS,
  liveChatConnectionOf,
  liveChatIdleDeadline,
  liveChatSessionsOn,
  type LiveChatConnection,
} from "@/lib/worldLiveChatConnection";

/**
 * - `loading` : réglages ou connexion pas encore lus ;
 * - `off` : la connexion n'est pas tenue dans ce monde, présent d'office ;
 * - `joined` : connecté ;
 * - `away` : pas (ou plus) connecté.
 */
export type LiveChatSessionStatus = "loading" | "off" | "joined" | "away";
export type LiveChatSessionResult = "ok" | "too_fast" | "error";

/** La frappe ne repousse la déconnexion qu'une fois par minute. */
const TOUCH_EVERY_MS = 60_000;

/**
 * La connexion du joueur à la chatbox d'un monde (migrations 244 et 245),
 * tenue seulement en mode « Rejoindre » : par la base, une ligne par joueur et
 * par monde ; elle survit à un rechargement, et la base annonce dans le fil
 * l'arrivée et chaque départ. En mode `auto`, rien n'est tenu (`off`).
 *
 * Une déconnexion pour inactivité (minuteur ici, ou tâche planifiée en base
 * pour qui a fermé l'onglet) et les connexions d'un autre onglet arrivent par
 * les messages système du fil, sur le canal du monde.
 */
export function useLiveChatSession(worldId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const { userId } = useCurrentUser();
  const reconnectEpoch = useReconnectEpoch();
  const [loaded, setLoaded] = useState<{ worldId: string; connection: LiveChatConnection } | null>(null);
  const connection = loaded && loaded.worldId === worldId ? loaded.connection : null;
  const sessionsOn = connection ? liveChatSessionsOn(connection) : false;
  // La dernière activité connue ; `null` : pas connecté ; `undefined` : pas encore lu.
  const [lastActive, setLastActive] = useState<{ worldId: string; at: string | null } | null>(null);
  const at = lastActive && lastActive.worldId === worldId ? lastActive.at : undefined;
  const lastTouchRef = useRef(0);

  useEffect(() => {
    if (!worldId) return;
    let cancelled = false;
    void supabase
      .from(TABLE.WORLDS)
      .select(LIVE_CHAT_CONNECTION_FIELDS.join(", "))
      .eq("id", worldId)
      .maybeSingle()
      .then(({ data }: { data: unknown }) => {
        if (!cancelled) setLoaded({ worldId, connection: liveChatConnectionOf(data as Parameters<typeof liveChatConnectionOf>[0]) });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId]);

  const [refreshes, setRefreshes] = useState(0);
  const refresh = useCallback(() => setRefreshes((n) => n + 1), []);

  // L'état de la connexion : à l'arrivée, à chaque reconnexion, sur demande.
  useEffect(() => {
    if (!worldId || !userId || !sessionsOn) return;
    let cancelled = false;
    void supabase
      .rpc("world_live_chat_session", { p_world: worldId })
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (!cancelled && !error) setLastActive({ worldId, at: (data as string | null) ?? null });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId, userId, sessionsOn, reconnectEpoch, refreshes]);

  // À l'échéance, la base dit si la connexion est tombée (elle écrit alors le
  // message d'inactivité).
  const idleMinutes = connection?.idleMinutes ?? null;
  useEffect(() => {
    if (!worldId || !at) return;
    const deadline = liveChatIdleDeadline(at, idleMinutes);
    if (deadline === null) return;
    const timer = window.setTimeout(refresh, Math.max(0, deadline - Date.now()) + 50);
    return () => window.clearTimeout(timer);
  }, [worldId, at, idleMinutes, refresh]);

  // Un message système à son nom : un autre onglet a rejoint ou quitté, ou la
  // base a déconnecté pour inactivité.
  useTopic(worldId && userId && sessionsOn ? topic.world(worldId) : null, ({ event, payload }) => {
    if (event !== "live" || !worldId) return;
    const avis = payload as { op?: string; record?: { user_id?: string; system?: string | null; created_at?: string } };
    const r = avis.record;
    if (avis.op !== "INSERT" || !r?.system || r.user_id !== userId) return;
    setLastActive({ worldId, at: r.system === "join" ? (r.created_at ?? new Date().toISOString()) : null });
  });

  const join = useCallback(async (): Promise<LiveChatSessionResult> => {
    if (!worldId) return "error";
    const { data, error } = await supabase.rpc("join_world_live_chat", { p_world: worldId, p_announce: true });
    if (error) return (error as { message?: string }).message?.includes("Trop de messages") ? "too_fast" : "error";
    setLastActive({ worldId, at: (data as string | null) ?? new Date().toISOString() });
    return "ok";
  }, [supabase, worldId]);

  const leave = useCallback(async (): Promise<LiveChatSessionResult> => {
    if (!worldId) return "error";
    const { error } = await supabase.rpc("leave_world_live_chat", { p_world: worldId });
    if (error) return (error as { message?: string }).message?.includes("Trop de messages") ? "too_fast" : "error";
    setLastActive({ worldId, at: null });
    return "ok";
  }, [supabase, worldId]);

  /** La frappe : repousse la déconnexion, au plus une fois par minute. */
  const activity = useCallback(() => {
    if (!worldId || !at || idleMinutes === null) return;
    const now = Date.now();
    if (now - lastTouchRef.current < TOUCH_EVERY_MS) return;
    lastTouchRef.current = now;
    void supabase.rpc("touch_world_live_chat", { p_world: worldId }).then(({ data, error }: { data: unknown; error: unknown }) => {
      if (!error) setLastActive({ worldId, at: (data as string | null) ?? null });
    });
  }, [supabase, worldId, at, idleMinutes]);

  /** Un message envoyé : la base a noté l'activité. */
  const sent = useCallback(() => {
    if (worldId && at) setLastActive({ worldId, at: new Date().toISOString() });
  }, [worldId, at]);

  const status: LiveChatSessionStatus = !connection
    ? "loading"
    : !sessionsOn
      ? "off"
      : at === undefined
        ? "loading"
        : at
          ? "joined"
          : "away";

  return { status, connection, join, leave, activity, sent, refresh };
}
