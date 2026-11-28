import { describe, it, expect } from "vitest";
import { syncTokensWithFilters } from "@/components/chatrooms/search/searchTokens";
import type { SearchToken } from "@/components/chatrooms/search/types";
import type { SearchAuthorOption, SearchChatroomOption } from "@/lib/chatSearchDirectory";

// Les puces de la barre doivent toujours dire sur quoi porte la recherche :
// le panneau « Filtres » change les filtres, les puces suivent.

const authors: SearchAuthorOption[] = [
  { kind: "profile", id: "u1", label: "kaotika", avatarUrl: null },
  { kind: "persona", id: "p1", label: "kael", sublabel: "kaotika", avatarUrl: null },
];
const chatrooms: SearchChatroomOption[] = [
  { id: "c1", label: "général" },
  { id: "c2", label: "photos" },
];
const lists = { authors, chatrooms, containsLabels: { media: "Média", link: "Lien" } };

const general: SearchToken = { id: "channel:c1", type: "channel", label: "général", value: "c1" };

describe("syncTokensWithFilters", () => {
  it("un salon coché dans le panneau devient une puce", () => {
    const tokens = syncTokensWithFilters([general], { chatIds: ["c1", "c2"] }, lists);
    expect(tokens.map((t) => [t.type, t.label])).toEqual([
      ["channel", "général"],
      ["channel", "photos"],
    ]);
  });

  it("un salon décoché perd sa puce", () => {
    expect(syncTokensWithFilters([general], { chatIds: ["c2"] }, lists).map((t) => t.value)).toEqual(["c2"]);
  });

  it("auteurs, personas et contenu suivent aussi", () => {
    const tokens = syncTokensWithFilters([], { authorIds: ["u1"], personaIds: ["p1"], hasMedia: true }, lists);
    expect(tokens.map((t) => [t.type, t.kind ?? t.value, t.label])).toEqual([
      ["author", "profile", "kaotika"],
      ["author", "persona", "kael"],
      ["contains", "media", "Média"],
    ]);
  });

  it("la puce de mention reste tant que la mention est filtrée", () => {
    const mention: SearchToken = { id: "mentions:profile:u1", type: "mentions", label: "kaotika", value: "u1", kind: "profile", mentionUsername: "kaotika" };
    expect(syncTokensWithFilters([mention], { mentionsUsername: "kaotika" }, lists)).toEqual([mention]);
    expect(syncTokensWithFilters([mention], {}, lists)).toEqual([]);
  });
});
