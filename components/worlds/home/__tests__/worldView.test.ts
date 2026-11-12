import { describe, it, expect } from "vitest";
import { resolveWorldPanel, type WorldPanelContext } from "../worldView";

const ctx: WorldPanelContext = {
  enableWiki: true,
  enableMap: true,
  worldMapFlag: true,
  hasTimeline: true,
  canOpenSettings: true,
};

describe("resolveWorldPanel", () => {
  it("retombe sur l'accueil sans vue ou pour une vue inconnue", () => {
    expect(resolveWorldPanel(undefined, ctx)).toBe("home");
    expect(resolveWorldPanel(null, ctx)).toBe("home");
    expect(resolveWorldPanel("nimporte", ctx)).toBe("home");
  });

  it("ouvre les onglets toujours disponibles", () => {
    for (const v of ["members", "personas", "canvas", "catalogue"]) {
      expect(resolveWorldPanel(v, ctx)).toBe(v);
    }
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

  it("chronologie et réglages : conditionnés", () => {
    expect(resolveWorldPanel("timeline", { ...ctx, hasTimeline: false })).toBe("home");
    expect(resolveWorldPanel("settings", { ...ctx, canOpenSettings: false })).toBe("home");
    expect(resolveWorldPanel("settings", ctx)).toBe("settings");
  });
});
