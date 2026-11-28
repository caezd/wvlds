import { describe, it, expect } from "vitest";
import { parseChatBlock, readableMessageText } from "@/lib/chat-blocks";

describe("parseChatBlock", () => {
  it("retourne null si le contenu ne commence pas par {", () => {
    expect(parseChatBlock("bonjour")).toBeNull();
    expect(parseChatBlock("")).toBeNull();
  });

  it("retourne null pour du JSON invalide", () => {
    expect(parseChatBlock("{pas du json")).toBeNull();
  });

  it("retourne null pour un JSON valide mais sans _type connu", () => {
    expect(parseChatBlock('{"_type":"inconnu"}')).toBeNull();
    expect(parseChatBlock('{"foo":"bar"}')).toBeNull();
  });

  it("parse un bloc dé valide", () => {
    const block = parseChatBlock('{"_type":"dice","formula":"1d6","results":[4],"modifier":0,"total":4}');
    expect(block).toMatchObject({ _type: "dice", total: 4 });
  });

  it.each(["banner", "reveal", "npc", "hp", "callout", "choice", "ellipse"])(
    "reconnaît le type de bloc %s",
    (type) => {
      expect(parseChatBlock(`{"_type":"${type}"}`)).toMatchObject({ _type: type });
    },
  );

  it("parse un bloc choix avec sa question et ses options", () => {
    const block = parseChatBlock(
      '{"_type":"choice","question":"Où ?","options":[{"id":"a","label":"Nord"},{"id":"b","label":"Sud"}]}',
    );
    expect(block).toMatchObject({
      _type: "choice",
      question: "Où ?",
      options: [{ id: "a", label: "Nord" }, { id: "b", label: "Sud" }],
    });
  });
});

// Ce qu'un lecteur voit d'un bloc, pour la recherche : jamais son JSON.
describe("readableMessageText", () => {
  const json = (o: object) => JSON.stringify(o);

  it("un message ordinaire reste tel quel", () => {
    expect(readableMessageText("Bonjour tout le monde")).toBe("Bonjour tout le monde");
  });

  it("un choix : la question puis les options", () => {
    const choix = json({ _type: "choice", question: "Que cuisiner ?", options: [{ id: "a", label: "Des pâtes" }, { id: "b", label: "Du riz" }] });
    expect(readableMessageText(choix)).toBe("Que cuisiner ? · Des pâtes · Du riz");
  });

  it("un encadré : titre, texte et jauges", () => {
    const encadre = json({ _type: "callout", border: "full", title: "Cuisine", text: "Il est l'heure", gauges: [{ name: "Faim", current: 2, max: 5, color: "#fff" }] });
    expect(readableMessageText(encadre)).toBe("Cuisine · Il est l'heure · Faim");
  });

  it("les autres blocs : ce qui s'y lit", () => {
    expect(readableMessageText(json({ _type: "dice", formula: "1d20", results: [3], modifier: 0, total: 3, label: "Courage" }))).toBe("Courage · 1d20");
    expect(readableMessageText(json({ _type: "npc", name: "Garde", role: "Portier", stats: "PV 40" }))).toBe("Garde · Portier · PV 40");
    expect(readableMessageText(json({ _type: "hp", name: "Ogre", current: 3, max: 9 }))).toBe("Ogre");
    expect(readableMessageText(json({ _type: "anchor", label: "Chapitre 2" }))).toBe("Chapitre 2");
    expect(readableMessageText(json({ _type: "banner", url: "https://x.test/a.png", alt: "Forêt" }))).toBe("Forêt");
    expect(readableMessageText(json({ _type: "ellipse" }))).toBe("");
  });

  it("une révélation : son indice seulement, jamais le texte caché", () => {
    expect(readableMessageText(json({ _type: "reveal", text: "Le majordome", hint: "Qui ?" }))).toBe("Qui ?");
  });
});
