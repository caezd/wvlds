import { describe, it, expect } from "vitest";

import { bubbleStyle, readableTextOn } from "@/lib/bubbleColors";

describe("couleur des bulles de dialogue", () => {
  it("le fond est la couleur choisie telle quelle, sans opacité réduite", () => {
    expect(bubbleStyle("#f27a12")?.backgroundColor).toBe("#f27a12");
    expect(bubbleStyle("#f27a1280")?.backgroundColor).toBe("#f27a1280");
  });

  it("texte noir sur un fond clair, blanc sur un fond sombre", () => {
    expect(readableTextOn("#f27a12")).toBe("#000"); // orange de la capture
    expect(readableTextOn("#ffeb3b")).toBe("#000");
    expect(readableTextOn("#fff")).toBe("#000");
    expect(readableTextOn("#1d4ed8")).toBe("#fff");
    expect(readableTextOn("#7f1d1d")).toBe("#fff");
    expect(readableTextOn("#000000")).toBe("#fff");
  });

  it("une couleur transparente se lit mêlée au fond sombre de la page", () => {
    // Jaune presque opaque : clair. Le même à 15 % : c'est surtout le fond sombre.
    expect(readableTextOn("#ffeb3bee")).toBe("#000");
    expect(readableTextOn("#ffeb3b26")).toBe("#fff");
  });

  it("sans couleur, ou illisible, la bulle garde son style par défaut", () => {
    expect(bubbleStyle(null)).toBeUndefined();
    expect(bubbleStyle("rebeccapurple")).toEqual({ backgroundColor: "rebeccapurple" });
  });
});
