import { describe, it, expect } from "vitest";
import { REPLY_EXCERPT_MAX, replyAuthorLabel, replyExcerpt } from "@/lib/replyExcerpt";

describe("replyExcerpt", () => {
  it("rend le texte brut sur une ligne, sans Markdown", () => {
    expect(replyExcerpt("**Bonjour**\n\nà *tous*")).toBe("Bonjour à tous");
  });

  it("tronque au-delà de la longueur maximale", () => {
    const out = replyExcerpt("a".repeat(REPLY_EXCERPT_MAX + 50))!;
    expect(out.length).toBe(REPLY_EXCERPT_MAX);
    expect(out.endsWith("…")).toBe(true);
  });

  it("rend null pour un bloc de jeu", () => {
    expect(replyExcerpt('{"_type":"dice","expr":"1d6","result":3}')).toBeNull();
  });
});

describe("replyAuthorLabel", () => {
  it("préfère la persona, puis le pseudo", () => {
    expect(replyAuthorLabel({ persona: { name: "Aria" }, author: { username: "joueur" } })).toBe("Aria");
    expect(replyAuthorLabel({ persona: null, author: { username: "joueur" } })).toBe("joueur");
    expect(replyAuthorLabel(null)).toBeNull();
  });
});
