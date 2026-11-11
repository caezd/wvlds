// Regroupement des messages "SMS" consécutifs pour l'affichage en un seul
// bloc (façon échange de SMS), extrait de la boucle de rendu pour être
// testable indépendamment du DOM.

import { parseChatBlock } from "./chat-blocks";
import type { ChatMessageWithPersona } from "@/types/db";

export type RenderGroup =
  | { kind: "single"; message: ChatMessageWithPersona }
  | { kind: "sms"; messages: ChatMessageWithPersona[] };

/**
 * Un message est "SMS" seulement s'il porte le flag et n'est pas un bloc
 * structuré (dé, bannière…) — ces derniers ont leur propre chemin de rendu
 * et ne doivent jamais être regroupés, même si leur métadonnée est corrompue.
 */
function isSmsMessage(m: ChatMessageWithPersona): boolean {
  return !!m.metadata?.sms && parseChatBlock(m.content ?? "") === null;
}

/**
 * Partitionne une liste de messages en segments de rendu : les messages
 * "SMS" consécutifs sont fusionnés dans un même groupe, tout le reste
 * reste individuel.
 */
export function groupMessagesForRender(messages: ChatMessageWithPersona[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  for (const m of messages) {
    if (isSmsMessage(m)) {
      const last = groups[groups.length - 1];
      if (last?.kind === "sms") {
        last.messages.push(m);
        continue;
      }
      groups.push({ kind: "sms", messages: [m] });
    } else {
      groups.push({ kind: "single", message: m });
    }
  }
  return groups;
}

export type SmsRunFlags = {
  /** Le coin "extérieur" du haut est resserré (message précédent du même auteur). */
  sharpTop: boolean;
  /** Le coin "extérieur" du bas est resserré (message suivant du même auteur). */
  sharpBottom: boolean;
  /** Avatar affiché seulement sur le dernier message d'une même sous-série (style Messenger). */
  showAvatar: boolean;
};

function authorKey(m: ChatMessageWithPersona): string {
  return m.persona?.id ?? m.author_id ?? "";
}

/**
 * Pour un groupe de messages "SMS" déjà consécutifs, calcule par message si
 * ses bulles voisines proviennent du même auteur — pour resserrer les coins
 * de raccord et n'afficher l'avatar qu'une fois par sous-série, comme sur
 * Messenger.
 */
export function computeSmsRunFlags(messages: ChatMessageWithPersona[]): SmsRunFlags[] {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const sharpTop = !!prev && authorKey(prev) === authorKey(m);
    const sharpBottom = !!next && authorKey(next) === authorKey(m);
    return { sharpTop, sharpBottom, showAvatar: !sharpBottom };
  });
}

/**
 * Union dédupliquée (insensible à la casse, ordre de première apparition)
 * des avertissements de contenu portés par les messages d'un bloc SMS —
 * affichée une seule fois en tête du bloc plutôt que répétée par message.
 */
export function aggregateContentWarnings(messages: ChatMessageWithPersona[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of messages) {
    for (const tag of m.metadata?.content_warnings ?? []) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(tag);
    }
  }
  return result;
}

/**
 * Ajoute un message à la liste en respectant l'ordre des ids (croissants),
 * sans doublon. Les messages arrivent presque toujours dans l'ordre — on
 * ajoute alors en fin de liste, sans parcours — mais un rattrapage après
 * coupure peut livrer des messages plus anciens qu'un INSERT Realtime reçu
 * pendant sa lecture (cf. useRealtimeChatSync).
 *
 * Rend la liste d'origine, inchangée, si le message y figure déjà.
 */
export function insertMessageById<T extends { id: number }>(list: T[], msg: T): T[] {
  const last = list.at(-1);
  if (!last || last.id < msg.id) return [...list, msg];
  if (list.some((m) => m.id === msg.id)) return list;
  const index = list.findIndex((m) => m.id > msg.id);
  return [...list.slice(0, index), msg, ...list.slice(index)];
}
