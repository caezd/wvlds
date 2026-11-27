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
    expect(groups).toEqual([
      { id: "members", sections: ["roles"] },
      { id: "communications", sections: ["reports"] },
    ]);
  });

  it("Communications : annonces, message de bienvenue et signalements ; Membres : rôles et journal", () => {
    const groups = visibleSettingsGroups(() => true);
    expect(groups.find((g) => g.id === "communications")?.sections).toEqual(["announcements", "welcome", "reports"]);
    expect(groups.find((g) => g.id === "members")?.sections).toEqual(["roles", "activity"]);
    expect(groups.at(-1)?.id).toBe("communications");
  });

  it("Général et Communauté ouvrent le menu, hors groupe ; Monde : page d'accueil et catégories de salons", () => {
    const groups = visibleSettingsGroups(() => true);
    expect(groups.slice(0, 2)).toEqual([
      { id: "top", sections: ["general", "community"] },
      { id: "world", sections: ["home", "categories"] },
    ]);
    expect(UNTITLED_SETTINGS_GROUPS).toEqual(["top"]);
  });

  it("Fonctions : les pages, puis la sous-catégorie Économie", () => {
    const features = visibleSettingsGroups(() => true).find((g) => g.id === "features");
    expect(features?.sections).toEqual([
      "map", "wiki", "timeline", "chatbox", "catalog",
      "currency", "items", "shops", "trades",
    ]);
    expect(subgroupOf("trades")).toBe("economy");
    expect(subgroupOf("currency")).toBe("economy");
    expect(subgroupOf("items")).toBe("economy");
    expect(subgroupOf("shops")).toBe("economy");
    expect(subgroupOf("map")).toBeNull();
    // Le Catalogue est réservé : une page « Bientôt », sans interrupteur.
    expect(subgroupOf("catalog")).toBeNull();
    expect(isFeatureSection("catalog")).toBe(false);
  });

  it("Personas : une catégorie à part, entre Jeu et Membres", () => {
    const groups = visibleSettingsGroups(() => true);
    expect(groups.map((g) => g.id)).toEqual(["top", "world", "features", "game", "personas", "members", "communications"]);
    expect(groups.find((g) => g.id === "personas")?.sections).toEqual(
      ["personas", "skills", "faceclaims", "groups", "relations"],
    );
    // Des pages, pas une sous-catégorie : la fiche, les compétences et les
    // faceclaims restent des pages « Fonctions » (interrupteur et état).
    expect(subgroupOf("skills")).toBeNull();
    expect(isFeatureSection("skills")).toBe(true);
    expect(isFeatureSection("relations")).toBe(false);
  });

  it("les anciennes adresses mènent à leur nouvelle page", () => {
    const all = () => true;
    expect(requestedSection("catalogue", all)).toBe("items");
    expect(requestedSection("economy", all)).toBe("currency");
    // Les gains vivent dans la page Devises.
    expect(requestedSection("gains", all)).toBe("currency");
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
