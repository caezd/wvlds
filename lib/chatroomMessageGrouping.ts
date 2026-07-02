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
