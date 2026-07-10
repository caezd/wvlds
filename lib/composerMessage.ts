// Logique pure d'assemblage d'un message de chatroom, extraite de
// ChatroomComposer pour être testable indépendamment du DOM et de Supabase.

import { parseChatBlock } from "./chat-blocks";

export type MediaRef = { url: string; name: string };
export type ParticipantLike = { id: string; username: string | null };

/** Nombre de mots du texte brut. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Nombre de mots du texte. Un bloc structuré (dés, encadré…) compte pour 0. */
export function computeWordCount(text: string): number {
  if (parseChatBlock(text) !== null) return 0;
  return wordCount(text);
}

/** Extrait les `@pseudos` mentionnés (alphanumérique + underscore). */
export function extractMentions(text: string): string[] {
  return [...text.matchAll(/@([A-Za-z0-9_]+)/g)].map((m) => m[1]);
}

/**
 * Les avertissements de contenu ne s'appliquent qu'aux messages texte
 * « normaux » : les blocs structurés (dé, bannière, PNJ…) ont leur propre
 * rendu dédié et n'affichent jamais cette métadonnée.
 */
export function shouldApplyContentWarnings(text: string): boolean {
  return parseChatBlock(text) === null;
}

/**
 * Convertit la liste d'ids destinataires d'une note privée en libellés `@pseudo`.
 * Retourne null si la note privée n'est pas active (visibleTo === null).
 */
export function buildVisibleToLabels(
  visibleTo: string[] | null,
  participants: ParticipantLike[],
): string[] | null {
  if (visibleTo === null) return null;
  return visibleTo
    .map((id) => {
      const p = participants.find((pp) => pp.id === id);
      return p?.username ? `@${p.username}` : null;
    })
    .filter((l): l is string => l !== null);
}

export type MessageMetadata = {
  word_count?: number;
  bubbles?: true;
  bubbleColor?: string;
  sms?: true;
  media?: MediaRef[];
  visible_to_labels?: string[];
  content_warnings?: string[];
};

/**
 * Construit l'objet `metadata` du message à partir des options actives.
 * Retourne null si aucune métadonnée n'est présente (pour stocker NULL en base).
 */
export function buildMessageMetadata(opts: {
  wordCount: number;
  bubbleMode: boolean;
  bubbleColor: string | null;
  smsMode: boolean;
  media: MediaRef[];
  visibleToLabels: string[] | null;
  contentWarnings?: string[] | null;
}): MessageMetadata | null {
  const { wordCount, bubbleMode, bubbleColor, smsMode, media, visibleToLabels, contentWarnings } = opts;
  const metadata: MessageMetadata = {
    ...(wordCount > 0 ? { word_count: wordCount } : {}),
    ...(bubbleMode ? { bubbles: true as const, ...(bubbleColor ? { bubbleColor } : {}) } : {}),
    ...(smsMode ? { sms: true as const } : {}),
    ...(media.length > 0 ? { media } : {}),
    ...(visibleToLabels?.length ? { visible_to_labels: visibleToLabels } : {}),
    ...(contentWarnings?.length ? { content_warnings: contentWarnings } : {}),
  };
  return Object.keys(metadata).length > 0 ? metadata : null;
}
