import { parseChatBlock } from "@/lib/chat-blocks";
import { markdownToPlainText } from "@/lib/markdownToPlainText";

/** Longueur maximale de l'extrait d'un message cité. */
export const REPLY_EXCERPT_MAX = 140;

/**
 * Extrait d'un message cité, en texte brut sur une ligne. Rend null pour un
 * bloc de jeu (dé, PNJ, bannière…), dont le JSON n'a pas d'extrait lisible :
 * l'appelant affiche alors un libellé générique.
 */
export function replyExcerpt(content: string | null | undefined): string | null {
  const brut = content ?? "";
  if (parseChatBlock(brut)) return null;
  const texte = markdownToPlainText(brut).replace(/\s+/g, " ").trim();
  return texte.length > REPLY_EXCERPT_MAX ? `${texte.slice(0, REPLY_EXCERPT_MAX - 1).trimEnd()}…` : texte;
}

/** Nom affiché de l'auteur d'un message cité : persona, sinon pseudo. */
export function replyAuthorLabel(ref: { persona?: { name: string | null } | null; author?: { username: string | null } | null } | null | undefined): string | null {
  return ref?.persona?.name ?? ref?.author?.username ?? null;
}
