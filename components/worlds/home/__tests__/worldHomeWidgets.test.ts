import { describe, it, expect } from "vitest";
import { DEFAULT_WORLD_HOME_LAYOUT, resolveWorldHomeLayout } from "@/components/worlds/home/worldHomeWidgets";

describe("resolveWorldHomeLayout", () => {
  it("retombe sur l'ordre par défaut quand la valeur est null", () => {
    expect(resolveWorldHomeLayout(null)).toEqual(DEFAULT_WORLD_HOME_LAYOUT);
  });

  it("retombe sur l'ordre par défaut quand la valeur n'est pas un tableau", () => {
    expect(resolveWorldHomeLayout(undefined)).toEqual(DEFAULT_WORLD_HOME_LAYOUT);
    expect(resolveWorldHomeLayout("chatrooms")).toEqual(DEFAULT_WORLD_HOME_LAYOUT);
  });

  it("conserve l'ordre choisi par l'admin", () => {
    expect(resolveWorldHomeLayout(["stats", "chatrooms"])).toEqual(["stats", "chatrooms"]);
  });

  it("filtre les ids inconnus (widget supprimé depuis)", () => {
    expect(resolveWorldHomeLayout(["chatrooms", "ancien_widget", "stats"])).toEqual([
      "chatrooms",
      "stats",
    ]);
  });

  it("déduplique les ids répétés", () => {
    expect(resolveWorldHomeLayout(["chatrooms", "chatrooms"])).toEqual(["chatrooms"]);
  });

  it("retombe sur l'ordre par défaut si tous les ids sont invalides", () => {
    expect(resolveWorldHomeLayout(["foo", "bar"])).toEqual(DEFAULT_WORLD_HOME_LAYOUT);
  });
});
