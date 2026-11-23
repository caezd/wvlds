import { describe, it, expect } from "vitest";
import {
  isFeatureSection,
  requestedSection,
  urlWithSection,
  visibleSettingsGroups,
  type SettingsSectionId,
} from "../worldSettingsSections";

describe("worldSettingsSections", () => {
  it("retire les sections interdites, puis les groupes vides", () => {
    const groups = visibleSettingsGroups((id) => id === "roles" || id === "reports");
    expect(groups).toEqual([{ id: "members", sections: ["roles", "reports"] }]);
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
