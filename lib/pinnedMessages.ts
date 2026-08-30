import type { SupabaseClient } from "@supabase/supabase-js";

import { TABLE } from "@/lib/constants";
import { decryptMessage } from "@/lib/crypto";
import type { ChatMessageWithPersona, ChatPin } from "@/types/db";

/**
 * Messages épinglés qui ne sont pas dans la fenêtre chargée.
 *
 * Une épingle peut viser un message très ancien, hors de la page courante :
 * la barre d'épingles doit quand même afficher son contenu, et pas une carte
 * vide. Ces messages-là sont donc allés chercher un par un.
 *
 * ── Pourquoi c'est ici, et pas dans la vue ───────────────────
 * `ChatRoomView` n'est PAS remontée quand on passe d'un salon à l'autre : même
 * position dans l'arbre, pas de `key`. Une requête partie pour le salon A peut
 * donc revenir alors que le salon B est déjà à l'écran — et le déchiffrement
 * lit la clé courante, celle de B. Les messages de A en ressortaient
 * illisibles, épinglés dans le mauvais salon.
 *
 * `useChatPins` avait déjà colmaté l'étape d'avant — la liste des épingles —
 * et son commentaire nommait ce danger-ci. Restait à le traiter.
 */

/** Colonnes nécessaires à l'affichage d'un message dans la barre d'épingles. */
const COLONNES =
  "id, chat_id, content, author_id, created_at, metadata, visible_to, " +
  "persona:personas(id, user_id, name, avatar_url, frame:avatar_frame_id(asset_url)), " +
  "author:profiles(avatar_url, username)";

/**
 * Identifiants des messages épinglés qu'il reste à charger.
 *
 * @param pins     épingles du salon
 * @param charges  messages déjà dans la fenêtre affichée
 * @param enCache  messages déjà rapatriés par un appel précédent
 */
export function idsEpinglesManquants(
  pins: Pick<ChatPin, "message_id">[],
  charges: Pick<ChatMessageWithPersona, "id">[],
  enCache: Pick<ChatMessageWithPersona, "id">[],
): number[] {
  const connus = new Set<number>([...charges, ...enCache].map((m) => m.id));
  return [
    ...new Set(
      pins
        .map((p) => p.message_id)
        .filter((id): id is number => id !== null && !connus.has(id)),
    ),
  ];
}

/**
 * Charge et déchiffre les messages épinglés manquants.
 *
 * @param cle clé du salon ; `null` laisse le contenu tel quel
 * @returns les messages, ou `[]` si la requête n'a rien rendu
 */
export async function chargerMessagesEpingles(
  supabase: SupabaseClient,
  ids: number[],
  cle: string | null,
): Promise<ChatMessageWithPersona[]> {
  if (!ids.length) return [];

  const { data } = await supabase
    .from(TABLE.CHAT_MESSAGES)
    .select(COLONNES)
    .in("id", ids);
  if (!data) return [];

  return await Promise.all(
    (data as unknown as ChatMessageWithPersona[]).map(async (m) => ({
      ...m,
      content: cle ? await decryptMessage(m.content ?? "", cle) : (m.content ?? ""),
    })),
  );
}
