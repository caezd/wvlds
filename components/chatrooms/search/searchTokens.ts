import type { SearchFilters } from "@/lib/chatSearch";
import type { SearchAuthorOption, SearchChatroomOption } from "@/lib/chatSearchDirectory";
import type { SearchToken } from "./types";

export function authorToToken(option: SearchAuthorOption, type: "author" | "mentions"): SearchToken {
  const mentionUsername = option.kind === "profile" ? option.label : option.sublabel ?? undefined;
  return {
    id: `${type}:${option.kind}:${option.id}`,
    type,
    label: option.label,
    value: option.id,
    kind: option.kind,
    mentionUsername,
  };
}

type TokenLists = {
  authors: SearchAuthorOption[];
  chatrooms: SearchChatroomOption[];
  containsLabels: { media: string; link: string };
};

/**
 * Les puces de la barre, refaites d'après les filtres : le panneau « Filtres »
 * change les filtres d'un bloc, et les puces doivent toujours dire sur quoi
 * porte la recherche. Une puce déjà là garde sa place ; les nouvelles
 * suivent, dans l'ordre salon, auteur, persona, contenu.
 */
export function syncTokensWithFilters(prev: SearchToken[], filters: SearchFilters, lists: TokenLists): SearchToken[] {
  const wanted: SearchToken[] = [];
  for (const id of filters.chatIds ?? []) {
    const label = lists.chatrooms.find((c) => c.id === id)?.label ?? prev.find((t) => t.id === `channel:${id}`)?.label ?? "?";
    wanted.push({ id: `channel:${id}`, type: "channel", label, value: id });
  }
  const author = (kind: "profile" | "persona", id: string) => {
    const option = lists.authors.find((a) => a.kind === kind && a.id === id);
    const existing = prev.find((t) => t.id === `author:${kind}:${id}`);
    if (option) wanted.push(authorToToken(option, "author"));
    else if (existing) wanted.push(existing);
  };
  for (const id of filters.authorIds ?? []) author("profile", id);
  for (const id of filters.personaIds ?? []) author("persona", id);
  if (filters.hasMedia) wanted.push({ id: "contains:media", type: "contains", label: lists.containsLabels.media, value: "media" });
  if (filters.hasLink) wanted.push({ id: "contains:link", type: "contains", label: lists.containsLabels.link, value: "link" });
  // Le panneau ne pose pas de mention : la puce reste tant que le filtre aussi.
  const mention = prev.find((t) => t.type === "mentions");
  if (mention && filters.mentionsUsername) wanted.push(mention);

  const wantedIds = new Set(wanted.map((t) => t.id));
  const kept = prev.filter((t) => wantedIds.has(t.id)).map((t) => wanted.find((w) => w.id === t.id)!);
  const keptIds = new Set(kept.map((t) => t.id));
  return [...kept, ...wanted.filter((t) => !keptIds.has(t.id))];
}
