import { describe, it, expect } from "vitest";
import {
  isFeatureSection,
  requestedSection,
  urlWithSection,
  visibleSettingsGroups,
  UNTITLED_SETTINGS_GROUPS,
  subgroupOf,
  type SettingsSectionId,
} from "../worldSettingsSections";

describe("worldSettingsSections", () => {
  it("retire les sections interdites, puis les groupes vides", () => {
    const groups = visibleSettingsGroups((id) => id === "roles" || id === "reports");
    expect(groups).toEqual([{ id: "members", sections: ["roles", "reports"] }]);
  });

  it("Général et Communauté ouvrent le menu, hors groupe ; Monde ne garde que la page d'accueil", () => {
    const groups = visibleSettingsGroups(() => true);
    expect(groups.slice(0, 2)).toEqual([
      { id: "top", sections: ["general", "community"] },
      { id: "world", sections: ["home"] },
    ]);
    expect(UNTITLED_SETTINGS_GROUPS).toEqual(["top"]);
  });

  it("Fonctions : les pages, puis la sous-catégorie Économie (devises, objets, boutiques, échanges, gains)", () => {
    const features = visibleSettingsGroups(() => true).find((g) => g.id === "features");
    expect(features?.sections).toEqual(["map", "wiki", "personas", "timeline", "chatbox", "currency", "items", "shops", "trades", "gains"]);
    expect(subgroupOf("trades")).toBe("economy");
    expect(subgroupOf("gains")).toBe("economy");
    expect(subgroupOf("currency")).toBe("economy");
    expect(subgroupOf("items")).toBe("economy");
    expect(subgroupOf("shops")).toBe("economy");
    expect(subgroupOf("map")).toBeNull();
  });

  it("les anciennes adresses mènent à leur nouvelle page", () => {
    const all = () => true;
    expect(requestedSection("catalogue", all)).toBe("items");
    expect(requestedSection("economy", all)).toBe("currency");
    expect(requestedSection("economy", (id) => id !== "currency")).toBeNull();
  });

  it("la section demandée : connue et permise, sinon rien", () => {
    const allowed = (id: SettingsSectionId) => id !== "community";
    expect(requestedSection("map", allowed)).toBe("map");
    expect(requestedSection("community", allowed)).toBeNull();
    expect(requestedSection("inconnue", allowed)).toBeNull();
    expect(requestedSection(null, allowed)).toBeNull();
  });

  it("isFeatureSection", () => {
    expect(isFeatureSection("timeline")).toBe(true);
    expect(isFeatureSection("roles")).toBe(false);
    expect(isFeatureSection(null)).toBe(false);
  });

  it("urlWithSection garde les autres paramètres", () => {
    expect(urlWithSection("https://x.test/w/1?view=settings#h", "map")).toBe("/w/1?view=settings&section=map#h");
    expect(urlWithSection("https://x.test/w/1?view=settings&section=map", "wiki")).toBe("/w/1?view=settings&section=wiki");
    expect(urlWithSection("https://x.test/w/1?view=settings&section=map", null)).toBe("/w/1?view=settings");
  });
});
