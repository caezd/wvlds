import { describe, it, expect } from "vitest";

import { buildShelves, featuredPersonaId, type ShelfPersona } from "../buildShelves";

const p = (id: string, fields: Partial<ShelfPersona> = {}): ShelfPersona => ({
  id, name: id, created_at: null, user_id: "u1", username: "alice", is_npc: false, narrative_status: "alive", ...fields,
});

const MINE = [p("Moa", { user_id: "me", username: "moi" })];
const OTHERS = [
  p("Zed", { user_id: "u2", username: "zoe", playerStatus: "away", playerStatusUntil: "2026-10-03" }),
  p("Bea", { user_id: "u1", username: "alice" }),
  p("Cid", { user_id: "u1", username: "alice", narrative_status: "dead" }),
];
const NPCS = [p("Aubergiste", { user_id: "u2", is_npc: true })];
const GROUPS = [{ id: "g2", name: "Garde", color: "#f00" }, { id: "g1", name: "Cour", color: "#00f" }];
const GROUP_OF = new Map([["Bea", "g1"], ["Zed", "g2"], ["Aubergiste", "g1"]]);

const base = {
  mine: MINE, others: OTHERS, npcs: NPCS, groups: GROUPS, groupByPersona: GROUP_OF,
  sort: "name" as const, meId: "me", myUsername: "moi", keepMine: true, keepNpcs: false, canCreateNpc: false,
};

describe("buildShelves", () => {
  it("par joueur : moi d'abord, les joueurs par pseudo, les PNJ en dernier", () => {
    const shelves = buildShelves({ ...base, mode: "player" });
    expect(shelves.map((s) => [s.kind, s.label])).toEqual([
      ["me", "@moi"], ["player", "@alice"], ["player", "@zoe"], ["npc", null],
    ]);
    // Seule ma rangée porte la tuile de création (PNJ : il faut les gérer).
    expect(shelves.map((s) => s.create)).toEqual(["persona", null, null, null]);
    const alice = shelves[1];
    expect(alice.alive).toBe(1);
    expect(alice.items).toHaveLength(2);
    expect(shelves[2]).toMatchObject({ playerStatus: "away", playerStatusUntil: "2026-10-03" });
  });

  it("par joueur : les rangées vides sont masquées, sauf celles qu'on garde pour créer", () => {
    expect(buildShelves({ ...base, mode: "player", mine: [], npcs: [], keepMine: false }).map((s) => s.kind)).toEqual(["player", "player"]);
    const kept = buildShelves({ ...base, mode: "player", mine: [], npcs: [], keepNpcs: true, canCreateNpc: true });
    expect(kept.map((s) => [s.kind, s.create])).toEqual([["me", "persona"], ["player", null], ["player", null], ["npc", "npc"]]);
  });

  it("par groupe : dans l'ordre du monde, « Sans groupe » en dernier, sans doublon", () => {
    const shelves = buildShelves({ ...base, mode: "group" });
    expect(shelves.map((s) => [s.kind, s.label])).toEqual([["group", "Garde"], ["group", "Cour"], ["noGroup", null]]);
    expect(shelves[0].color).toBe("#f00");
    expect(shelves[1].items.map((i) => i.id)).toEqual(["Aubergiste", "Bea"]);
    expect(shelves[2].items.map((i) => i.id)).toEqual(["Cid", "Moa"]);
    expect(shelves.flatMap((s) => s.items)).toHaveLength(5);
    expect(shelves.every((s) => s.create === null)).toBe(true);
  });

  it("par groupe : une affectation à un groupe inconnu tombe dans « Sans groupe »", () => {
    const shelves = buildShelves({ ...base, mode: "group", groupByPersona: new Map([["Bea", "ghost"]]) });
    expect(shelves.map((s) => s.kind)).toEqual(["noGroup"]);
  });

  it("liste : une seule étagère, tout le monde trié", () => {
    const shelves = buildShelves({ ...base, mode: "list" });
    expect(shelves).toHaveLength(1);
    expect(shelves[0].kind).toBe("all");
    expect(shelves[0].items.map((i) => i.id)).toEqual(["Aubergiste", "Bea", "Cid", "Moa", "Zed"]);
    expect(buildShelves({ ...base, mode: "list", mine: [], others: [], npcs: [] })).toEqual([]);
  });
});

describe("featuredPersonaId", () => {
  const five = [p("A", { narrative_status: "dead" }), p("B"), p("C"), p("D"), p("E")];

  it("met en vedette le plus actif en jeu : le plus de messages, puis le plus récent", () => {
    const activity = new Map([
      ["A", { count: 50, lastAt: "2026-09-26T10:00:00Z" }], // décédé : écarté
      ["B", { count: 3, lastAt: "2026-09-20T10:00:00Z" }],
      ["C", { count: 7, lastAt: "2026-09-01T10:00:00Z" }],
      ["D", { count: 7, lastAt: "2026-09-25T10:00:00Z" }],
    ]);
    expect(featuredPersonaId(five, activity)).toBe("D");
  });

  it("pas de vedette sous cinq personas, ni quand personne n'a écrit", () => {
    const activity = new Map([["B", { count: 3, lastAt: "2026-09-20T10:00:00Z" }]]);
    expect(featuredPersonaId(five.slice(0, 4), activity)).toBeUndefined();
    expect(featuredPersonaId(five, new Map())).toBeUndefined();
  });
});
