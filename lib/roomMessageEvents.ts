/**
 * Avis de messages PRIVÉS (`visible_to`) d'un salon, pour l'utilisateur
 * courant.
 *
 * Une note privée n'est jamais annoncée sur le canal du salon (`room:<id>`,
 * migration 212) : son avis part sur le canal personnel de chacun de ses
 * destinataires (`msgs:<user>`, événement `room_message`), qu'ouvre
 * NotificationsProvider. Celui-ci relaie les avis ici ; le salon ouvert
 * (useRealtimeChatSync) s'y abonne pour son propre id.
 */
export type RoomMessageEvent = {
  op: "INSERT" | "UPDATE" | "DELETE";
  id: number;
  chat_id: string;
  author_id: string | null;
};

const listeners = new Set<(event: RoomMessageEvent) => void>();

export function emitRoomMessage(event: RoomMessageEvent): void {
  for (const l of listeners) l(event);
}

/** @returns la fonction de désabonnement */
export function onRoomMessage(listener: (event: RoomMessageEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
