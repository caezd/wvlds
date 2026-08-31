import { describe, it, expect } from "vitest";
import {
  ANCHOR_CONTEXT_LENGTH,
  ANCHOR_MAX_QUOTE_LENGTH,
  anchorPreview,
  buildAnchor,
  resolveAnchor,
  type TextAnchor,
} from "@/lib/wikiAnnotations";

const TEXT = "Mara Kline observe la ville. Les Gardiens veillent sur Meridian depuis neuf ans.";

/** Ancre une sous-chaîne par son texte, comme le ferait une sélection à l'écran. */
function anchorOf(text: string, quote: string, occurrence = 0): TextAnchor {
  let index = -1;
  for (let i = 0; i <= occurrence; i++) index = text.indexOf(quote, index + 1);
  const anchor = buildAnchor(text, index, index + quote.length);
  if (!anchor) throw new Error(`ancre impossible pour « ${quote} »`);
  return anchor;
}

describe("buildAnchor", () => {
  it("mémorise l'extrait, son voisinage et sa position", () => {
    const anchor = anchorOf(TEXT, "Les Gardiens");
    expect(anchor.quote).toBe("Les Gardiens");
    expect(anchor.start).toBe(TEXT.indexOf("Les Gardiens"));
    expect(anchor.prefix).toBe("Mara Kline observe la ville. ");
    expect(anchor.suffix).toBe(" veillent sur Meridian depuis neuf ans.");
  });

  it("borne le voisinage à ANCHOR_CONTEXT_LENGTH", () => {
    const long = "a".repeat(200) + "CIBLE" + "b".repeat(200);
    const anchor = anchorOf(long, "CIBLE");
    expect(anchor.prefix).toHaveLength(ANCHOR_CONTEXT_LENGTH);
    expect(anchor.suffix).toHaveLength(ANCHOR_CONTEXT_LENGTH);
  });

  it("accepte des bornes inversées", () => {
    const start = TEXT.indexOf("Meridian");
    expect(buildAnchor(TEXT, start + 8, start)?.quote).toBe("Meridian");
  });

  it("refuse une sélection vide ou uniquement blanche", () => {
    expect(buildAnchor(TEXT, 5, 5)).toBeNull();
    expect(buildAnchor("mot   mot", 3, 6)).toBeNull();
  });

  it("refuse une sélection plus longue que la limite", () => {
    const huge = "x".repeat(ANCHOR_MAX_QUOTE_LENGTH + 1);
    expect(buildAnchor(huge, 0, huge.length)).toBeNull();
    expect(buildAnchor(huge, 0, ANCHOR_MAX_QUOTE_LENGTH)).not.toBeNull();
  });

  it("ne déborde pas des bornes du texte", () => {
    const anchor = buildAnchor(TEXT, -10, 4);
    expect(anchor?.quote).toBe("Mara");
    expect(anchor?.prefix).toBe("");
  });
});

describe("resolveAnchor", () => {
  it("retrouve l'extrait quand rien n'a bougé", () => {
    const anchor = anchorOf(TEXT, "Les Gardiens");
    expect(resolveAnchor(TEXT, anchor)).toEqual({
      start: TEXT.indexOf("Les Gardiens"),
      end: TEXT.indexOf("Les Gardiens") + "Les Gardiens".length,
    });
  });

  it("suit l'extrait quand du texte est inséré avant", () => {
    const anchor = anchorOf(TEXT, "Les Gardiens");
    const edited = "Chapitre premier.\n\n" + TEXT;
    const range = resolveAnchor(edited, anchor);
    expect(range).not.toBeNull();
    expect(edited.slice(range!.start, range!.end)).toBe("Les Gardiens");
    expect(range!.start).toBe(edited.indexOf("Les Gardiens"));
  });

  it("suit l'extrait quand du texte est supprimé avant", () => {
    const anchor = anchorOf(TEXT, "Meridian");
    const edited = TEXT.replace("Mara Kline observe la ville. ", "");
    const range = resolveAnchor(edited, anchor);
    expect(edited.slice(range!.start, range!.end)).toBe("Meridian");
  });

  it("choisit l'occurrence dont le voisinage correspond, pas la première venue", () => {
    const text = "Le mur est haut. Le mur est bas. Le mur est vieux.";
    const anchor = anchorOf(text, "Le mur", 2); // celui de « vieux »
    const edited = "Prologue. " + text;
    const range = resolveAnchor(edited, anchor);
    expect(edited.slice(range!.start, range!.start + 20)).toBe("Le mur est vieux.");
  });

  it("départage deux occurrences au voisinage identique par la position d'origine", () => {
    const repeated = "ligne\n".repeat(6);
    const anchor = anchorOf(repeated, "ligne", 4);
    const range = resolveAnchor(repeated, anchor);
    expect(range!.start).toBe(anchor.start);
  });

  it("déclare l'annotation détachée quand l'extrait a disparu", () => {
    const anchor = anchorOf(TEXT, "Les Gardiens");
    expect(resolveAnchor(TEXT.replace("Les Gardiens", "Les Sentinelles"), anchor)).toBeNull();
  });

  it("ne se fie pas à une position devenue hors du texte", () => {
    const anchor = anchorOf(TEXT, "Meridian");
    const shorter = "Meridian.";
    expect(resolveAnchor(shorter, anchor)).toEqual({ start: 0, end: 8 });
  });

  it("renvoie null sur une ancre sans extrait", () => {
    expect(resolveAnchor(TEXT, { quote: "", prefix: "", suffix: "", start: 0 })).toBeNull();
  });
});

describe("anchorPreview", () => {
  it("laisse intact un extrait court", () => {
    expect(anchorPreview("Les Gardiens")).toBe("Les Gardiens");
  });

  it("coupe au milieu pour garder le début et la fin", () => {
    const preview = anchorPreview("a".repeat(80) + "b".repeat(80), 41);
    expect(preview.startsWith("a".repeat(20))).toBe(true);
    expect(preview.endsWith("b".repeat(20))).toBe(true);
    expect(preview).toContain("…");
    expect(preview.length).toBeLessThanOrEqual(41);
  });
});
