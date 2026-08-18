import { describe, it, expect } from "vitest";
import {
  ALL_WORLD_HOME_WIDGETS,
  DEFAULT_WORLD_HOME_LAYOUT,
  resolveWorldHomeLayout,
} from "@/components/worlds/home/worldHomeWidgets";

describe("resolveWorldHomeLayout", () => {
  it("retombe sur l'ordre par défaut quand la valeur est null", () => {
    expect(resolveWorldHomeLayout(null)).toEqual(DEFAULT_WORLD_HOME_LAYOUT);
  });

  it("retombe sur l'ordre par défaut quand la valeur n'est pas un tableau", () => {
    expect(resolveWorldHomeLayout(undefined)).toEqual(DEFAULT_WORLD_HOME_LAYOUT);
    expect(resolveWorldHomeLayout("chatrooms")).toEqual(DEFAULT_WORLD_HOME_LAYOUT);
  });

  it("conserve l'ordre choisi par l'admin", () => {
    expect(resolveWorldHomeLayout(["members_online", "chatrooms"])).toEqual(["members_online", "chatrooms"]);
  });

  it("filtre les ids inconnus (widget supprimé depuis)", () => {
    expect(resolveWorldHomeLayout(["chatrooms", "ancien_widget", "members_online"])).toEqual([
      "chatrooms",
      "members_online",
    ]);
  });

  it("« stats » n'est plus un widget reconnu — filtré comme un id inconnu", () => {
    // Régression : les statistiques sont désormais une zone fixe sous le
    // titre, réglée par une case à cocher (home_show_stats), plus un widget
    // plaçable dans un ordre/une grille — voir worldHomeGrid.ts.
    expect(ALL_WORLD_HOME_WIDGETS).not.toContain("stats");
    expect(resolveWorldHomeLayout(["chatrooms", "stats"])).toEqual(["chatrooms"]);
  });

  it("déduplique les ids répétés", () => {
    expect(resolveWorldHomeLayout(["chatrooms", "chatrooms"])).toEqual(["chatrooms"]);
  });

  it("retombe sur l'ordre par défaut si tous les ids sont invalides", () => {
    expect(resolveWorldHomeLayout(["foo", "bar"])).toEqual(DEFAULT_WORLD_HOME_LAYOUT);
  });

  it("respecte un tableau vide explicite (admin ayant retiré tous les widgets)", () => {
    expect(resolveWorldHomeLayout([])).toEqual([]);
  });

  it("l'annonce est un widget connu mais pas activé par défaut (opt-in)", () => {
    expect(ALL_WORLD_HOME_WIDGETS).toContain("announcement");
    expect(DEFAULT_WORLD_HOME_LAYOUT).not.toContain("announcement");
  });

  it("conserve l'annonce quand un admin l'a explicitement ajoutée à l'ordre", () => {
    expect(resolveWorldHomeLayout(["chatrooms", "announcement"])).toEqual(["chatrooms", "announcement"]);
  });

  it("les raccourcis wiki et personas récentes sont connus mais pas activés par défaut (opt-in)", () => {
    expect(ALL_WORLD_HOME_WIDGETS).toContain("wiki_shortcuts");
    expect(ALL_WORLD_HOME_WIDGETS).toContain("personas_recent");
    expect(DEFAULT_WORLD_HOME_LAYOUT).not.toContain("wiki_shortcuts");
    expect(DEFAULT_WORLD_HOME_LAYOUT).not.toContain("personas_recent");
  });
});
