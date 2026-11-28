import { describe, it, expect } from "vitest";
import { resolveCalloutStyle, compactCallout, bordersFromSides } from "@/lib/calloutStyle";
import { readableMessageText, type CalloutBlock } from "@/lib/chat-blocks";

const callout = (b: Partial<CalloutBlock> = {}): CalloutBlock => ({ _type: "callout", ...b });

// Les encadrés déjà envoyés n'ont aucun des nouveaux champs : ils doivent se
// lire exactement comme avant.
describe("resolveCalloutStyle — encadrés existants", () => {
  it("bordure complète : quatre côtés fins, arrondi léger, fond à 8 %", () => {
    const s = resolveCalloutStyle(callout({ border: "full", accent: "#C084FC" }));
    expect(s.sides).toEqual(["top", "right", "bottom", "left"]);
    expect(s.borderWidth).toBe("thin");
    expect(s.borderStyle).toBe("solid");
    expect(s.radius).toBe("soft");
    expect(s.bgIntensity).toBe(8);
    expect(s.borderColor).toContain("28%");
  });

  it("bordure à gauche : un filet épais de la couleur d'accent", () => {
    const s = resolveCalloutStyle(callout({ border: "left", accent: "#C084FC" }));
    expect(s.sides).toEqual(["left"]);
    expect(s.borderWidth).toBe("thick");
    expect(s.borderColor).toBe("#C084FC");
  });

  it("sans bordure : aucun côté et pas de fond", () => {
    const s = resolveCalloutStyle(callout({ border: "none", accent: "#C084FC" }));
    expect(s.sides).toEqual([]);
    expect(s.bgIntensity).toBe(0);
  });

  it("« rounded: false » devient l'arrondi « aucun »", () => {
    expect(resolveCalloutStyle(callout({ rounded: false })).radius).toBe("none");
  });

  it("sans accent : ni teinte de bordure ni couleur de titre", () => {
    const s = resolveCalloutStyle(callout({}));
    expect(s.borderColor).toBeUndefined();
    expect(s.titleColor).toBeUndefined();
    expect(s.bgColor).toBeUndefined();
  });

  it("valeurs par défaut de mise en page et de typographie", () => {
    const s = resolveCalloutStyle(callout({}));
    expect(s).toMatchObject({
      separator: false, align: "left", width: "full", iconPosition: "inline", iconSize: "small",
      titleFont: "inherit", titleSmallCaps: false, bodyItalic: false, collapsible: false,
    });
  });
});

describe("resolveCalloutStyle — nouveaux réglages", () => {
  it("les côtés cochés remplacent ceux de la bordure", () => {
    expect(resolveCalloutStyle(callout({ border: "full", sides: ["top", "bottom"] })).sides).toEqual(["top", "bottom"]);
  });

  it("titre, bordure et fond prennent chacun leur couleur", () => {
    const s = resolveCalloutStyle(callout({ accent: "#111111", titleColor: "#222222", borderColor: "#333333", bgColor: "#444444", bgIntensity: 30 }));
    expect(s.titleColor).toBe("#222222");
    expect(s.borderColor).toBe("#333333");
    expect(s.bgColor).toBe("#444444");
    expect(s.bgIntensity).toBe(30);
  });

  it("l'intensité du fond reste entre 0 et 100", () => {
    expect(resolveCalloutStyle(callout({ accent: "#111111", bgIntensity: 140 })).bgIntensity).toBe(100);
    expect(resolveCalloutStyle(callout({ accent: "#111111", bgIntensity: -5 })).bgIntensity).toBe(0);
  });

  it("une icône à côté ou au-dessus est grande par défaut", () => {
    expect(resolveCalloutStyle(callout({ iconPosition: "side" })).iconSize).toBe("large");
    expect(resolveCalloutStyle(callout({ iconPosition: "top", iconSize: "medium" })).iconSize).toBe("medium");
  });

  it("une image se pose en fond, voilée à moitié par défaut", () => {
    const s = resolveCalloutStyle(callout({ image: "https://x/y.png" }));
    expect(s.imageMode).toBe("background");
    expect(s.imageVeil).toBe(50);
  });

  it("une valeur inconnue retombe sur la valeur par défaut", () => {
    const s = resolveCalloutStyle(callout({ width: "géante" as never, titleFont: "comic" as never }));
    expect(s.width).toBe("full");
    expect(s.titleFont).toBe("inherit");
  });
});

describe("bordersFromSides", () => {
  it("quatre côtés : complète ; le seul côté gauche : à gauche ; aucun : aucune", () => {
    expect(bordersFromSides(["top", "right", "bottom", "left"])).toBe("full");
    expect(bordersFromSides(["left"])).toBe("left");
    expect(bordersFromSides([])).toBe("none");
    expect(bordersFromSides(["top", "bottom"])).toBe("full");
  });
});

describe("compactCallout", () => {
  it("retire les réglages égaux à leur valeur par défaut", () => {
    const block = compactCallout(callout({
      title: "Souvenir", border: "full", sides: ["top", "right", "bottom", "left"],
      borderWidth: "thin", borderStyle: "solid", radius: "soft", bgIntensity: 8, accent: "#C084FC",
      titleColor: "#C084FC", width: "full", iconPosition: "inline", iconSize: "small",
      titleFont: "inherit", titleSmallCaps: false, bodyItalic: false, collapsible: false,
    }));
    expect(block).toEqual({ _type: "callout", title: "Souvenir", border: "full", accent: "#C084FC" });
  });

  it("garde ceux qui changent le rendu", () => {
    const block = compactCallout(callout({ border: "full", sides: ["top"], borderStyle: "dashed", radius: "round", bodyItalic: true }));
    expect(block).toMatchObject({ sides: ["top"], borderStyle: "dashed", radius: "round", bodyItalic: true });
  });

  it("garde « rounded: false » de l'ancien format", () => {
    expect(compactCallout(callout({ rounded: false }))).toEqual({ _type: "callout", rounded: false });
  });
});

describe("readableMessageText — champs d'un encadré", () => {
  it("lit les champs « clé : valeur »", () => {
    const content = JSON.stringify(callout({ title: "Scène", fields: [{ key: "Lieu", value: "Port de Sel" }, { key: "Heure", value: "minuit" }] }));
    expect(readableMessageText(content)).toBe("Scène · Lieu : Port de Sel · Heure : minuit");
  });
});
