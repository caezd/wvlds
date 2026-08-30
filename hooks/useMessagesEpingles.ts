"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { idsEpinglesManquants, chargerMessagesEpingles } from "@/lib/pinnedMessages";
import type { ChatMessageWithPersona, ChatPin } from "@/types/db";

/**
 * Messages épinglés qui ne sont pas dans la fenêtre chargée.
 *
 * Une épingle peut viser un message très ancien : la barre d'épingles va alors
 * le chercher séparément, pour afficher son contenu plutôt qu'une carte vide.
 *
 * ── Pourquoi un hook, et pas quelques lignes dans la vue ─────
 * `ChatRoomView` n'est PAS remontée quand on passe d'un salon à l'autre : même
 * position dans l'arbre, pas de `key`. Deux conséquences, et il faut les deux
 * précautions :
 *
 *  1. L'état survit au changement de salon — d'où la remise à zéro immédiate.
 *  2. Une requête partie pour le salon précédent peut revenir alors que le
 *     suivant est déjà à l'écran. Elle serait déchiffrée avec la clé COURANTE,
 *     celle du nouveau salon : ses messages s'afficheraient épinglés au mauvais
 *     endroit, et illisibles. D'où la garde d'annulation.
 *
 * `useChatPins` avait déjà colmaté l'étape d'avant — la liste des épingles —
 * et son commentaire nommait ce danger-ci ; il restait ouvert.
 *
 * @param cleRef clé du salon, lue au dernier moment (elle arrive après coup)
 * @param roomKey même clé, en état : elle relance la charge quand elle apparaît
 */
export function useMessagesEpingles(
  supabase: SupabaseClient,
  chatId: string,
  pins: Pick<ChatPin, "message_id">[],
  messages: ChatMessageWithPersona[],
  cleRef: { current: string | null },
  roomKey: string | null,
): ChatMessageWithPersona[] {
  const [horsFenetre, setHorsFenetre] = useState<ChatMessageWithPersona[]>([]);

  // On repart d'une liste vide dès le changement de salon, sans attendre quoi
  // que ce soit : garder celle du salon précédent l'afficherait un instant.
  useEffect(() => {
    setHorsFenetre([]);
  }, [chatId]);

  useEffect(() => {
    const manquants = idsEpinglesManquants(pins, messages, horsFenetre);
    if (!manquants.length) return;

    let annule = false;
    void (async () => {
      const charges = await chargerMessagesEpingles(supabase, manquants, cleRef.current);
      if (annule || !charges.length) return;
      setHorsFenetre((prec) => [...prec, ...charges]);
    })();
    return () => {
      annule = true;
    };
    // `horsFenetre` est lu pour ne pas redemander ce qu'on a déjà ; l'effet ne
    // se relance pas en boucle puisqu'il ne fait rien quand plus rien ne manque.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, pins, messages, roomKey, horsFenetre]);

  return horsFenetre;
}
