"use client";

import { useEffect, useMemo, useRef } from "react";
import { openRealtimeChannel } from "@/lib/realtimeChannel";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { TABLE, channel as CH } from "@/lib/constants";
import { MESSAGE_COLUMNS } from "@/lib/chatMessagePage";
import type { ChatroomTurn } from "@/lib/chatroomTurns";
import { onRoomMessage } from "@/lib/roomMessageEvents";
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
export const CATCHUP_MAX_PAGES = 10;

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
  /**
   * Le rattrapage a atteint sa limite (CATCHUP_MAX_PAGES pages pleines) : trop
   * de messages manqués pour les rejouer un à un. La vue recharge alors la page
   * la plus récente et rend l'id du plus récent message affiché ; le hook
   * repart de là. Sans ce relais, le reste du trou était perdu : un INSERT en
   * direct faisait avancer le curseur au-delà, et les rattrapages suivants
   * l'ignoraient. Absent : le rattrapage continue sans limite.
   */
  onCatchUpGap?: () => Promise<number | null>;
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
  onCatchUpGap,
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
    onCatchUpGap,
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
    onCatchUpGap,
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
        for (let page = 0; ; page++) {
          // Trop de messages manqués : la vue recharge la page la plus récente.
          if (page >= CATCHUP_MAX_PAGES && callbacksRef.current.onCatchUpGap) {
            const dernier = await callbacksRef.current.onCatchUpGap();
            if (isMounted && dernier !== null && (latestIdRef.current === null || dernier > latestIdRef.current)) {
              latestIdRef.current = dernier;
            }
            return;
          }
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

    // ── Avis de messages ─────────────────────────────────────────
    // Même traitement que l'avis vienne du canal du salon (message public) ou,
    // relayé par NotificationsProvider, du canal personnel (note privée).
    const surAvisMessage = async (avis: { op?: string; id?: number }) => {
      if (!isMounted || typeof avis.id !== "number") return;
      const id = avis.id;

      if (avis.op === "DELETE") {
        callbacksRef.current.onMessageDeleted(id);
        return;
      }

      if (avis.op === "UPDATE") {
        // Les avis ne portent pas le contenu : relu sous la policy de lecture.
        const { data } = await supabase
          .from(TABLE.CHAT_MESSAGES)
          .select("id, content, metadata")
          .eq("id", id)
          .maybeSingle();
        if (!isMounted || !data) return;
        const row = data as { id: number; content: string; metadata: ChatMessageMeta | null };
        callbacksRef.current.onMessageUpdated(row.id, row.content, row.metadata ?? null);
        return;
      }

      // INSERT — re-fetch avec join persona pour garder la structure uniforme
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
        (data as unknown as { author_id?: string | null }).author_id ?? undefined,
      );
    };

    // Notes privées de ce salon, relayées depuis le canal personnel.
    const desabonnerPrives = onRoomMessage((avis) => {
      if (avis.chat_id === chatId) void surAvisMessage(avis);
    });

    // Nom de canal stable, ouverture sérialisée : une réouverture attend la
    // fermeture précédente. Cf. lib/realtimeChannel.
    //
    // Canal PRIVÉ `room:<id>` (migration 212) : la base y diffuse des avis
    // (ids seulement) à chaque changement ; l'accès est vérifié une fois, à
    // l'abonnement. Remplace sept flux `postgres_changes`, dont un abonnement
    // NON FILTRÉ à toutes les mises à jour de `personas`.
    type Avis = { payload?: Record<string, unknown> };
    const fermerCanal = openRealtimeChannel(supabase, CH.chatMessages(chatId), (ch) => {

    ch.on("broadcast", { event: "message" }, (msg: Avis) => {
      void surAvisMessage((msg.payload ?? {}) as { op?: string; id?: number });
    });

    // Salon — titre / bannière / icône
    ch.on("broadcast", { event: "chatroom" }, (msg: Avis) => {
      if (!isMounted) return;
      callbacksRef.current.onChatroomPatched((msg.payload ?? {}) as ChatroomPatch);
    });

    // Réactions INSERT / DELETE
    ch.on("broadcast", { event: "reaction" }, (msg: Avis) => {
      if (!isMounted) return;
      const row = (msg.payload ?? {}) as { op?: string; message_id?: number; emoji?: string; user_id?: string };
      if ((row.op !== "INSERT" && row.op !== "DELETE") || row.message_id === undefined || !row.emoji) return;
      if (selfId && row.user_id === selfId) return;
      callbacksRef.current.onReactionChange(row.message_id, row.emoji, row.op === "INSERT" ? 1 : -1);
    });

    // Ordre de passage (INSERT / UPDATE ; le retrait est un UPDATE, cf. removeTurn)
    ch.on("broadcast", { event: "turn" }, (msg: Avis) => {
      if (!isMounted) return;
      callbacksRef.current.onTurnChanged?.((msg.payload ?? {}) as unknown as ChatroomTurn);
    });

    // Avatar d'une persona ayant écrit dans ce salon
    ch.on("broadcast", { event: "persona" }, (msg: Avis) => {
      if (!isMounted) return;
      const row = (msg.payload ?? {}) as { id?: string; avatar_url?: string | null };
      if (row.id) callbacksRef.current.onPersonaUpdated?.(row.id, row.avatar_url ?? null);
    });

    // Votes de choix INSERT / UPDATE (revote) / DELETE
    ch.on("broadcast", { event: "vote" }, (msg: Avis) => {
      if (!isMounted) return;
      const row = (msg.payload ?? {}) as {
        op?: string; message_id?: number; user_id?: string;
        old_option_id?: string | null; new_option_id?: string | null;
      };
      if (!row.op || row.message_id === undefined) return;
      if (selfId && row.user_id === selfId) return;
      callbacksRef.current.onVoteChange?.(row.message_id, row.old_option_id ?? null, row.new_option_id ?? null);
    });

    // Rattrapage à chaque (re)jonction : la première souscription, mais aussi
    // les re-jonctions automatiques de supabase-js après une coupure brève.
    ch.subscribe((status) => {
      if (status !== "SUBSCRIBED" || !isMounted) return;
      void rattraper();
      callbacksRef.current.onSubscribed?.();
    });
    return ch;
    }, { config: { private: true } });

    return () => {
      isMounted = false;
      desabonnerPrives();
      fermerCanal();
    };
    // Les callbacks sont lus via callbacksRef au moment de l'événement : leur
    // identité, qui change à chaque rendu du parent, n'a pas à rouvrir le canal.
  }, [chatId, supabase, selfId, reconnectEpoch, t]);
}
