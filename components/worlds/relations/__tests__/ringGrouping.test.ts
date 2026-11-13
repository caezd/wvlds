import { describe, it, expect } from "vitest";
import { GROUPLESS_KEY, groupIdOfKey, parseGroupBy, ringArcsInput } from "../ringGrouping";

const p = (id: string, user_id: string) => ({ id, name: id, avatar_url: null, user_id, narrative_status: "alive" as const });
const userList = [
  { member: { user_id: "u1" }, ps: [p("a", "u1"), p("b", "u1")] },
  { member: { user_id: "u2" }, ps: [p("c", "u2"), p("d", "u2")] },
];
const groups = [
  { id: "g2", name: "Ordre", color: "#00f", sort_index: 1 },
  { id: "g1", name: "Maison", color: "#f00", sort_index: 0 },
];
const groupByPersona = new Map([["a", "g1"], ["d", "g1"], ["c", "g2"]]);

describe("ringArcsInput", () => {
  it("par joueur : un arc par joueur, personas filtrés", () => {
    const arcs = ringArcsInput("player", userList, groups, groupByPersona, (id) => id !== "b");
    expect(arcs).toEqual([
      { userId: "u1", personaIds: ["a"] },
      { userId: "u2", personaIds: ["c", "d"] },
    ]);
  });

  it("par groupe : groupes dans leur ordre de réglage, puis « sans groupe »", () => {
    const arcs = ringArcsInput("group", userList, groups, groupByPersona, () => true);
    expect(arcs).toEqual([
      { userId: "group:g1", personaIds: ["a", "d"] },
      { userId: "group:g2", personaIds: ["c"] },
      { userId: GROUPLESS_KEY, personaIds: ["b"] },
    ]);
  });

  it("un groupe inconnu (supprimé) compte comme « sans groupe »", () => {
    const arcs = ringArcsInput("group", userList, [], new Map([["a", "disparu"]]), () => true);
    expect(arcs).toEqual([{ userId: GROUPLESS_KEY, personaIds: ["a", "b", "c", "d"] }]);
  });
});

describe("clés et valeurs", () => {
  it("groupIdOfKey et parseGroupBy", () => {
    expect(groupIdOfKey("group:g1")).toBe("g1");
    expect(groupIdOfKey(GROUPLESS_KEY)).toBeNull();
    expect(groupIdOfKey("u1")).toBeNull();
    expect(parseGroupBy("group")).toBe("group");
    expect(parseGroupBy("autre")).toBeNull();
  });
});
