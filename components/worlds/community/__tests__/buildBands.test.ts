import { describe, it, expect } from "vitest";

import { EMPTY_PERSONA_FILTERS } from "@/components/personas/personaFilters";
import { buildBands, type BandMember, type BandPersona, type CommunityFilters, type PresenceState } from "../buildBands";

const GM = { id: "r-gm", name: "MJ", hoist: true };
const SCRIBE = { id: "r-scribe", name: "Scribe", hoist: false };

const member = (user_id: string, fields: Partial<BandMember> = {}): BandMember => ({
  user_id, username: user_id, isOwner: false, effectiveStatus: "active", roles: [], ...fields,
});
const persona = (id: string, user_id: string, fields: Partial<BandPersona> = {}): BandPersona => ({
  id, name: id, user_id, username: user_id, narrative_status: "alive", is_npc: false, ...fields,
});

const MEMBERS = [
  member("zed"),
  member("anna", { effectiveStatus: "paused" }),
  member("bob"),
  member("gmone", { roles: [GM] }),
  member("owner", { isOwner: true }),
  member("me", { roles: [SCRIBE] }),
];
const PERSONAS = new Map<string, BandPersona[]>([
  ["zed", [persona("Zorg", "zed", { narrative_status: "dead" })]],
  ["bob", [persona("Aeris", "bob"), persona("Brom", "bob")]],
  ["me", [persona("Moa", "me")]],
]);
const NPCS = [persona("Aubergiste", "owner", { is_npc: true })];
const PRESENCE: Record<string, PresenceState> = { bob: "online", zed: "away" };

const filters = (f: Partial<CommunityFilters> = {}): CommunityFilters => ({ ...EMPTY_PERSONA_FILTERS, online: false, ...f });

function bands(f: Partial<CommunityFilters> = {}, extra: Partial<Parameters<typeof buildBands>[0]> = {}) {
  return buildBands({
    members: MEMBERS,
    personasByUser: PERSONAS,
    npcs: NPCS,
    meId: "me",
    filters: filters(f),
    groupByPersona: new Map(),
    hoistedRoleIds: [GM.id],
    presenceOf: (id) => PRESENCE[id] ?? "offline",
    showNpcBand: true,
    ...extra,
  });
}

describe("buildBands", () => {
  it("moi, le propriétaire, les rôles « hoist », les autres (actifs, puis présence, puis nom), les PNJ", () => {
    expect(bands().map((b) => b.key)).toEqual(["me", "owner", "gmone", "bob", "zed", "anna", "__npc__"]);
  });

  it("un membre sans persona reste visible tant qu'aucun filtre de persona n'est posé", () => {
    expect(bands().find((b) => b.key === "owner")?.personas).toEqual([]);
    expect(bands({ status: "dead" }).map((b) => b.key)).toEqual(["zed"]);
  });

  it("la recherche d'un persona garde son membre, avec ce seul persona et le compte des autres", () => {
    const found = bands({ query: "aer" });
    expect(found.map((b) => b.key)).toEqual(["bob"]);
    expect(found[0].personas.map((p) => p.id)).toEqual(["Aeris"]);
    expect(found[0].hidden).toBe(1);
    // « Voir tout » : la bande rend tous ses personas.
    expect(bands({ query: "aer" }, { expanded: new Set(["bob"]) })[0].personas).toHaveLength(2);
  });

  it("la recherche d'un membre ou d'un rôle garde tous ses personas", () => {
    expect(bands({ query: "BOB" }).map((b) => [b.key, b.personas.length])).toEqual([["bob", 2]]);
    expect(bands({ query: "mj" }).map((b) => b.key)).toEqual(["gmone"]);
  });

  it("« en ligne » ne garde que les membres en ligne, sans les PNJ", () => {
    expect(bands({ online: true }).map((b) => b.key)).toEqual(["bob"]);
  });

  it("la bande des PNJ : absente sans PNJ ni permission, seule quand on filtre sur les PNJ", () => {
    expect(bands({}, { npcs: [], showNpcBand: false }).some((b) => b.kind === "npc")).toBe(false);
    expect(bands({}, { npcs: [], showNpcBand: true }).some((b) => b.kind === "npc")).toBe(true);
    expect(bands({ kind: "npc" }).map((b) => b.key)).toEqual(["__npc__"]);
  });
});
