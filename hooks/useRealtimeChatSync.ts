"use client";

import { useEffect, useMemo, useRef } from "react";
import { openRealtimeChannel } from "@/lib/realtimeChannel";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { TABLE, channel as CH } from "@/lib/constants";
import { MESSAGE_COLUMNS } from "@/lib/chatMessagePage";
import type { ChatroomTurn } from "@/lib/chatroomTurns";
import type { ChatMessageWithPersona, ChatMessageMeta } from "@/types/db";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

/**
 * Colonnes relues pour un message arrivé en temps réel ou rattrapé : les mêmes
 * que la première page (cadre d'avatar, auteur, message cité compris).
 */
const REALTIME_MESSAGE_COLUMNS = MESSAGE_COLUMNS;

/** Taille d'une page de rattrapage, et nombre maximal de pages par rattrapage. */
export const CATCHUP_PAGE_SIZE = 50;
const CATCHUP_MAX_PAGES = 10;

export type ChatroomPatch = {
  title?: string | null;
  name?: string | null;
  banner_url?: string | null;
  icon_url?: string | null;
};

type Props = {
  chatId: string;
  selfId: string | null;
  initialLatestId: number | null;
  onMessageInserted: (msg: ChatMessageWithPersona, authorId?: string) => void;
  onMessageUpdated: (id: number, content: string, metadata: ChatMessageMeta | null) => void;
  onMessageDeleted: (id: number) => void;
  onChatroomPatched: (patch: ChatroomPatch) => void;
  onReactionChange: (messageId: number, emoji: string, delta: 1 | -1) => void;
  onVoteChange?: (messageId: number, prevOptionId: string | null, nextOptionId: string | null) => void;
  onPersonaUpdated?: (personaId: string, avatarUrl: string | null) => void;
  /**
   * Le message est-il déjà affiché ? Un message que l'on vient d'envoyer est
   * ajouté par la vue dès la réponse de l'insertion : son INSERT Realtime n'a
   * alors pas à être relu.
   */
  isMessageKnown?: (id: number) => boolean;
  /**
   * Appelé à chaque (re)jonction du canal, en plus du rattrapage des nouveaux
   * messages : la vue y relit ce qu'elle affiche (éditions, suppressions,
   * réactions, votes manqués pendant la coupure).
   */
  onSubscribed?: () => void;
  /** Ordre de passage du salon créé ou modifié (migration 211). */
  onTurnChanged?: (turn: ChatroomTurn) => void;
};

export function useRealtimeChatSync({
  chatId,
  selfId,
  initialLatestId,
  onMessageInserted,
  onMessageUpdated,
  onMessageDeleted,
  onChatroomPatched,
  onReactionChange,
  onVoteChange,
  onPersonaUpdated,
  isMessageKnown,
  onSubscribed,
  onTurnChanged,
}: Props) {
  const t = useTranslations("chatrooms");
  const supabase = useMemo(() => createClient(), []);
  const reconnectEpoch = useReconnectEpoch();
  const latestIdRef = useRef<number | null>(initialLatestId);

  useEffect(() => {
    latestIdRef.current = initialLatestId;
  }, [chatId, initialLatestId]);

  // Miroir synchronisé PENDANT le rendu (pas dans un effet) : les callbacks du
  // parent sont souvent recréés à chaque rendu (fonctions inline). Si l'effet
  // ci-dessous en dépendait directement, le canal seul et fusionné se
  // fermerait/rouvrirait en boucle à chaque rendu du parent — perdant tout
  // événement arrivant pendant la fenêtre fermée. On les lit via ce ref à
  // l'intérieur des handlers à la place.
  const callbacksRef = useRef({
    onMessageInserted,
    onMessageUpdated,
    onMessageDeleted,
    onChatroomPatched,
    onReactionChange,
    onVoteChange,
    onPersonaUpdated,
    isMessageKnown,
    onSubscribed,
    onTurnChanged,
  });
  callbacksRef.current = {
    onMessageInserted,
    onMessageUpdated,
    onMessageDeleted,
    onChatroomPatched,
    onReactionChange,
    onVoteChange,
    onPersonaUpdated,
    isMessageKnown,
    onSubscribed,
    onTurnChanged,
  };

  // Un seul canal Realtime par chatroom (au lieu d'un canal par table/événement) :
  // messages (INSERT/UPDATE/DELETE), chatroom (UPDATE), réactions, votes et avatar
  // persona sont tous multiplexés sur le même canal via plusieurs bindings `.on()`.
  // Réduit le nombre de handshakes `subscribe()` à l'ouverture d'une salle et la
  // charge Realtime (canaux concurrents) côté client comme côté projet Supabase.
  useEffect(() => {
    // isMounted guards against Strict Mode: cleanup sets it to false so that
    // a channel lingering after removeChannel() ignores any late-arriving events.
    let isMounted = true;

    // ── Rattrapage ──────────────────────────────────────────────
    // Le Realtime ne rejoue rien : un message inséré pendant que le canal
    // n'était pas (encore) joint est perdu pour lui. Ça arrive dans trois cas :
    //   - entre le rendu serveur et la souscription (quelques centaines de ms) ;
    //   - pendant une coupure réseau / un onglet longtemps caché, avant que
    //     `reconnectEpoch` ne rouvre le canal ;
    //   - quand la page vient du cache du routeur client (`staleTimes`, cf.
    //     next.config.ts) : ses messages initiaux datent de la visite
    //     précédente.
    // À chaque souscription aboutie, on relit donc les messages d'id supérieur
    // au dernier connu. Les doublons avec un INSERT Realtime arrivé entre-temps
    // sont écartés par la vue (dédoublonnage par id, insertion triée).
    let rattrapageEnCours = false;
    const rattraper = async () => {
      if (rattrapageEnCours) return;
      rattrapageEnCours = true;
      try {
        let curseur = latestIdRef.current;
        for (let page = 0; page < CATCHUP_MAX_PAGES; page++) {
          let query = supabase
            .from(TABLE.CHAT_MESSAGES)
            .select(REALTIME_MESSAGE_COLUMNS)
            .eq("chat_id", chatId);
          if (curseur !== null) query = query.gt("id", curseur);
          const { data, error } = await query
            .order("id", { ascending: true })
            .limit(CATCHUP_PAGE_SIZE);
          if (!isMounted || error || !Array.isArray(data)) return;

          for (const row of data as unknown as ChatMessageWithPersona[]) {
            const id = Number(row.id);
            curseur = id;
            // Le Realtime a pu livrer un message plus récent pendant la
            // lecture : le curseur partagé ne recule jamais.
            if (latestIdRef.current === null || id > latestIdRef.current) latestIdRef.current = id;
            callbacksRef.current.onMessageInserted(row, row.author_id ?? undefined);
          }
          if (data.length < CATCHUP_PAGE_SIZE) return;
        }
      } finally {
        rattrapageEnCours = false;
      }
    };

    // Nom de canal stable, ouverture sérialisée : une réouverture attend la
    // fermeture précédente. Cf. lib/realtimeChannel.
    const fermerCanal = openRealtimeChannel(supabase, CH.chatMessages(chatId), (ch) => {

    // INSERT — re-fetch avec join persona pour garder la structure uniforme
    ch.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: TABLE.CHAT_MESSAGES,
        filter: `chat_id=eq.${chatId}`,
      },
      async (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (!isMounted) return;

        const id = (payload.new as { id: number }).id;
        if (latestIdRef.current !== null && id <= latestIdRef.current) return;
        latestIdRef.current = id;
        if (callbacksRef.current.isMessageKnown?.(id)) return;

        const { data, error } = await supabase
          .from(TABLE.CHAT_MESSAGES)
          .select(REALTIME_MESSAGE_COLUMNS)
          .eq("id", id)
          .single();

        if (!isMounted) return;

        if (error || !data) {
          toast.error(t("loadMessageFailed"));
          return;
        }

        callbacksRef.current.onMessageInserted(
          data as unknown as ChatMessageWithPersona,
          data.author_id ?? undefined,
        );
      },
    );

    // DELETE — suppression de message
    ch.on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: TABLE.CHAT_MESSAGES,
        filter: `chat_id=eq.${chatId}`,
      },
      (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (!isMounted) return;
        const id = (payload.old as { id: number }).id;
        if (id) callbacksRef.current.onMessageDeleted(id);
      },
    );

    // UPDATE — édition de contenu
    ch.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: TABLE.CHAT_MESSAGES,
        filter: `chat_id=eq.${chatId}`,
      },
      (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (!isMounted) return;
        const next = payload.new as { id: number; content: string; metadata: ChatMessageMeta | null };
        callbacksRef.current.onMessageUpdated(next.id, next.content, next.metadata ?? null);
      },
    );

    // UPDATE chatroom — titre / bannière / icône
    ch.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: TABLE.CHATROOMS,
        filter: `id=eq.${chatId}`,
      },
      (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (!isMounted) return;
        callbacksRef.current.onChatroomPatched(payload.new as ChatroomPatch);
      },
    );

    // Reactions INSERT / DELETE
    ch.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: TABLE.CHAT_MESSAGE_REACTIONS,
        filter: `chat_id=eq.${chatId}`,
      },
      (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (!isMounted) return;
        const ev = payload.eventType;
        if (ev !== "INSERT" && ev !== "DELETE") return;

        type ReactionRow = { message_id: number; emoji: string; user_id: string };
        const row = (ev === "DELETE" ? payload.old : payload.new) as ReactionRow | null;
        if (!row) return;

        if (selfId && row.user_id === selfId) return;

        callbacksRef.current.onReactionChange(row.message_id, row.emoji, ev === "INSERT" ? 1 : -1);
      },
    );

    // Ordre de passage (INSERT / UPDATE ; le retrait est un UPDATE, cf. removeTurn)
    if (callbacksRef.current.onTurnChanged) {
      for (const event of ["INSERT", "UPDATE"] as const) {
        ch.on(
          "postgres_changes",
          { event, schema: "public", table: TABLE.CHATROOM_TURNS, filter: `chat_id=eq.${chatId}` },
          (payload: { new: Record<string, unknown> }) => {
            if (!isMounted) return;
            callbacksRef.current.onTurnChanged?.(payload.new as unknown as ChatroomTurn);
          },
        );
      }
    }

    // Personas UPDATE — avatar_url mis à jour
    if (callbacksRef.current.onPersonaUpdated) {
      ch.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "personas" },
        (payload: { new: Record<string, unknown> }) => {
          if (!isMounted) return;
          const row = payload.new as { id: string; avatar_url?: string | null };
          if (row.id) callbacksRef.current.onPersonaUpdated?.(row.id, row.avatar_url ?? null);
        },
      );
    }

    // Votes de choix INSERT / UPDATE (revote) / DELETE
    if (callbacksRef.current.onVoteChange) {
      ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: TABLE.CHAT_CHOICE_VOTES,
          filter: `chat_id=eq.${chatId}`,
        },
        (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (!isMounted) return;
          const ev = payload.eventType;
          if (ev !== "INSERT" && ev !== "UPDATE" && ev !== "DELETE") return;

          type VoteRow = { message_id: number; option_id: string; user_id: string };
          const newRow = payload.new as VoteRow | null;
          const oldRow = payload.old as VoteRow | null;
          const row = ev === "DELETE" ? oldRow : newRow;
          if (!row) return;

          if (selfId && row.user_id === selfId) return;

          callbacksRef.current.onVoteChange?.(
            row.message_id,
            ev === "INSERT" ? null : (oldRow?.option_id ?? null),
            ev === "DELETE" ? null : (newRow?.option_id ?? null),
          );
        },
      );
    }

    // Rattrapage à chaque (re)jonction : la première souscription, mais aussi
    // les re-jonctions automatiques de supabase-js après une coupure brève.
    ch.subscribe((status) => {
      if (status !== "SUBSCRIBED" || !isMounted) return;
      void rattraper();
      callbacksRef.current.onSubscribed?.();
    });
    return ch;
    });

    return () => {
      isMounted = false;
      fermerCanal();
    };
    // onVoteChange/onPersonaUpdated délibérément absents des deps : seule leur
    // présence (fournis ou non par l'appelant) compte pour construire les
    // bindings, lue via callbacksRef au moment où l'effet tourne — pas leur
    // identité de fonction, qui changerait à chaque rendu du parent.
  }, [chatId, supabase, selfId, reconnectEpoch, t]);
}
