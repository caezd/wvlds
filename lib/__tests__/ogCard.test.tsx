import { describe, it, expect, vi } from "vitest";

// Le vrai next-intl, pas le mock global (vitest.setup.ts, en français seul) :
// l'image se traduit hors de React, par createTranslator, dans les trois langues.
vi.mock("next-intl", async () => await vi.importActual("next-intl"));
import { renderToStaticMarkup } from "react-dom/server";
import { OgCard, OgWorldCard, ogLocale, ogTitle, ogWorldTexts } from "@/lib/ogCard";
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

describe("ogTitle : l'accroche de l'image générique", () => {
  it("dans la langue demandée", () => {
    expect(ogTitle("fr")).toBe("Créez des mondes, incarnez vos personnages et écrivez vos histoires en temps réel.");
    expect(ogTitle("en")).toBe("Build worlds, play your characters and write your stories in real time.");
    expect(ogTitle("es")).toBe("Cree mundos, encarne a sus personajes y escriba sus historias en tiempo real.");
  });
});

describe("ogWorldTexts : la carte d'un monde, traduite", () => {
  it("les membres accordés dans la langue demandée", () => {
    expect(ogWorldTexts("fr", monde)).toEqual({ name: "Hextech", meta: "7 membres", excerpt: "Un monde", locked: false });
    expect(ogWorldTexts("en", { ...monde, memberCount: 1 }).meta).toBe("1 member");
    expect(ogWorldTexts("es", monde).meta).toBe("7 miembros");
  });

  it("un monde privé", () => {
    const prive = parseSharePreview({ id: W, name: "FINAL COCKTASY", private: true })!;
    expect(ogWorldTexts("fr", prive).meta).toBe("Monde privé · sur invitation");
    expect(ogWorldTexts("en", prive).meta).toBe("Private world · invite only");
    expect(ogWorldTexts("es", prive).meta).toBe("Mundo privado · solo con invitación");
  });
});

describe("OgWorldCard : bannière en fond, carte du monde en bas à gauche", () => {
  const BANNIERE = "data:image/jpeg;base64,AAAA";
  const ICONE = "data:image/png;base64,BBBB";
  const textes = { name: "Hextech", meta: "7 membres", excerpt: "Un monde", locked: false };

  it("avec bannière et icône : les deux images et le logo, sans le mot WVLDS", () => {
    const html = renderToStaticMarkup(<OgWorldCard {...textes} banner={BANNIERE} icon={ICONE} />);
    expect(html).toContain(`src="${BANNIERE}"`);
    expect(html).toContain(`src="${ICONE}"`);
    expect(html).toContain('data-og="logo"');
    expect(html).not.toContain(">W</span><span>V</span>");
  });

  it("l'extrait de la description sous le nom ; aucun sans description", () => {
    expect(renderToStaticMarkup(<OgWorldCard {...textes} />)).toContain('data-og="extrait"');
    expect(renderToStaticMarkup(<OgWorldCard {...textes} />)).toContain(">U</span><span>n</span>");
    expect(renderToStaticMarkup(<OgWorldCard {...textes} excerpt={null} />)).not.toContain('data-og="extrait"');
  });

  it("verrouillé : le cadenas à la place de l'icône, sans image", () => {
    const html = renderToStaticMarkup(<OgWorldCard {...textes} locked icon={ICONE} />);
    expect(html).not.toContain("<img");
    expect(html).toContain('data-og="cadenas"');
  });
});

describe("OgCard : image générique", () => {
  it("l'accroche, sans image", () => {
    const html = renderToStaticMarkup(<OgCard title="Créez des mondes." />);
    expect(html).toContain(">C</span><span>r</span>");
    expect(html).not.toContain("<img");
  });
});
