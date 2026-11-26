import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OgCard, ogLocale, ogTexts } from "@/lib/ogCard";
import { parseSharePreview } from "@/lib/sharePreview";

const W = "f1e4d2c9-e56f-454a-bde2-8f9eade06e65";
const monde = parseSharePreview({ id: W, name: "Hextech", description: "Un monde", member_count: 7 })!;

describe("ogLocale : langue de l'image d'aperçu, passée dans son adresse", () => {
  it("garde fr, en, es ; ramène fr-CA, en-US… à leur langue", () => {
    expect(ogLocale("en")).toBe("en");
    expect(ogLocale("fr-CA")).toBe("fr");
    expect(ogLocale("en-US")).toBe("en");
    expect(ogLocale("es")).toBe("es");
  });

  it("toute autre valeur donne la langue par défaut", () => {
    expect(ogLocale("de")).toBe("fr");
    expect(ogLocale(null)).toBe("fr");
  });
});

describe("ogTexts : textes de la carte d'aperçu", () => {
  it("générique : l'accroche de l'application, dans la langue demandée", () => {
    expect(ogTexts("fr", null)).toEqual({
      surtitle: null,
      title: "Créez des mondes, incarnez vos personnages et écrivez vos histoires en temps réel.",
      subtitle: null,
    });
    expect(ogTexts("en", null).title).toBe("Build worlds, play your characters and write your stories in real time.");
    expect(ogTexts("es", null).title).toBe("Cree mundos, encarne a sus personajes y escriba sus historias en tiempo real.");
  });

  it("un monde : ses propres textes, le libellé traduit", () => {
    expect(ogTexts("en", monde)).toEqual({ surtitle: "Public world", title: "Hextech", subtitle: "Un monde" });
    expect(ogTexts("es", { ...monde, ageRestricted: true, description: null }).surtitle).toBe("Mundo público · 18+");
  });
});

describe("OgCard : bannière en fond, icône à côté du titre", () => {
  const BANNIERE = "data:image/jpeg;base64,AAAA";
  const ICONE = "data:image/png;base64,BBBB";
  const textes = { surtitle: "Monde public", title: "Hextech", subtitle: "Un monde" };

  it("avec bannière et icône : les deux images, la bannière voilée pour la lecture", () => {
    const html = renderToStaticMarkup(<OgCard {...textes} banner={BANNIERE} icon={ICONE} />);
    expect(html).toContain(`src="${BANNIERE}"`);
    expect(html).toContain(`src="${ICONE}"`);
    expect(html).toContain("linear-gradient");
  });

  it("sans image : la carte texte, sans balise img", () => {
    const html = renderToStaticMarkup(<OgCard {...textes} />);
    expect(html).not.toContain("<img");
  });
});
