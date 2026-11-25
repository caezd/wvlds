import { describe, it, expect } from "vitest";
import { resolveWorldPanel, type WorldPanelContext } from "../worldView";

const ctx: WorldPanelContext = {
  enableWiki: true,
  enableMap: true,
  worldMapFlag: true,
  hasTimeline: true,
  hasShops: true,
  canOpenSettings: true,
};

describe("resolveWorldPanel", () => {
  it("retombe sur l'accueil sans vue ou pour une vue inconnue", () => {
    expect(resolveWorldPanel(undefined, ctx)).toBe("home");
    expect(resolveWorldPanel(null, ctx)).toBe("home");
    expect(resolveWorldPanel("nimporte", ctx)).toBe("home");
  });

  it("ouvre les onglets toujours disponibles", () => {
    for (const v of ["members", "personas", "canvas"]) {
      expect(resolveWorldPanel(v, ctx)).toBe(v);
    }
  });

  it("Objets et Compétences n'ont pas de vue : un ancien lien retombe sur l'accueil", () => {
    // Ils se gèrent dans les réglages (Économie › Inventaire, Personas › Compétences).
    expect(resolveWorldPanel("catalogue", ctx)).toBe("home");
    expect(resolveWorldPanel("skills", ctx)).toBe("home");
  });

  it("wiki : suit le réglage du monde (NULL vaut activé)", () => {
    expect(resolveWorldPanel("wiki", ctx)).toBe("wiki");
    expect(resolveWorldPanel("wiki", { ...ctx, enableWiki: null })).toBe("wiki");
    expect(resolveWorldPanel("wiki", { ...ctx, enableWiki: false })).toBe("home");
  });

  it("carte : exige le réglage du monde ET le drapeau global", () => {
    expect(resolveWorldPanel("map", ctx)).toBe("map");
    expect(resolveWorldPanel("map", { ...ctx, enableMap: false })).toBe("home");
    expect(resolveWorldPanel("map", { ...ctx, worldMapFlag: false })).toBe("home");
  });

  it("boutiques : exigent le drapeau, l'économie et l'inventaire (migration 249)", () => {
    expect(resolveWorldPanel("shops", ctx)).toBe("shops");
    expect(resolveWorldPanel("shops", { ...ctx, hasShops: false })).toBe("home");
  });

  it("chronologie et réglages : conditionnés", () => {
    expect(resolveWorldPanel("timeline", { ...ctx, hasTimeline: false })).toBe("home");
    expect(resolveWorldPanel("settings", { ...ctx, canOpenSettings: false })).toBe("home");
    expect(resolveWorldPanel("settings", ctx)).toBe("settings");
  });
});
