import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  getWorldMaps,
  createWorldMap,
  updateWorldMap,
  deleteWorldMap,
  createMapPin,
  updateMapPin,
  deleteMapPin,
} from "@/app/actions/worldMap";
import { createClient } from "@/lib/supabase/server";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

describe("getWorldMaps", () => {
  it("retourne les cartes et les pins, avec fallbacks vides", async () => {
    const maps = [
      { id: "m1", world_id: "w1", image_url: null, label: "Continent", sort_index: 0 },
      { id: "m2", world_id: "w1", image_url: null, label: "Donjon", sort_index: 1 },
    ];
    const pins = [{ id: "p1", world_id: "w1", map_id: "m1", title: "Port" }];
    use(createSupabaseMock({ results: [{ data: maps }, { data: pins }] }));
    const res = await getWorldMaps("w1");
    expect(res.maps).toEqual(maps);
    expect(res.pins).toEqual(pins);
  });

  it("retourne des listes vides quand rien n'existe", async () => {
    use(createSupabaseMock({ results: [{ data: null }, { data: null }] }));
    const res = await getWorldMaps("w1");
    expect(res.maps).toEqual([]);
    expect(res.pins).toEqual([]);
  });
});

describe("mutations carte — garde d'authentification", () => {
  it.each([
    ["createWorldMap", () => createWorldMap("w1", { label: "x" })],
    ["updateWorldMap", () => updateWorldMap("m1", { label: "x" })],
    ["deleteWorldMap", () => deleteWorldMap("m1")],
    ["createMapPin", () => createMapPin("w1", "m1", 1, 2, "Pin")],
    ["updateMapPin", () => updateMapPin("p1", { title: "x" })],
    ["deleteMapPin", () => deleteMapPin("p1")],
  ])("%s lève si non connecté", async (_name, fn) => {
    use(createSupabaseMock({ user: null }));
    // Un CODE, pas une phrase : le message d'une exception finit dans un
    // `toast.error(e.message)` quelque part, et une phrase y arriverait en
    // français quelle que soit la langue lue.
    await expect(fn()).rejects.toThrow(ERR_NON_AUTHENTIFIE);
  });
});

describe("createMapPin", () => {
  it("insère le pin avec les bonnes coordonnées et retourne la donnée", async () => {
    const pin = { id: "p1", world_id: "w1", map_id: "m1", x: 10, y: 20, title: "Donjon" };
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: pin }] });
    use(mock);
    const res = await createMapPin("w1", "m1", 10, 20, "Donjon");
    expect(res).toEqual(pin);
    // `map_id` et non le seul `world_id` : sans lui, le lieu s'afficherait sur
    // toutes les cartes du monde (cf. migration 151).
    expect(mock.buildersFor("world_map_pins")[0].insert).toHaveBeenCalledWith({
      world_id: "w1",
      map_id: "m1",
      x: 10,
      y: 20,
      title: "Donjon",
    });
  });

  it("propage l'erreur Supabase", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: { message: "rls" } }] }));
    await expect(createMapPin("w1", "m1", 0, 0, "x")).rejects.toThrow("rls");
  });
});

describe("deleteMapPin", () => {
  it("supprime le pin par id", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] });
    use(mock);
    await deleteMapPin("p1");
    const b = mock.buildersFor("world_map_pins")[0];
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith("id", "p1");
  });
});

describe("createWorldMap", () => {
  it("insère une carte de plus dans le monde", async () => {
    // Un monde peut désormais en avoir plusieurs : c'est une insertion, et non
    // plus un upsert sur `world_id` — celui-ci écrasait l'unique carte.
    const map = { id: "m2", world_id: "w1", image_url: null, label: "Donjon", sort_index: 1 };
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: map }] });
    use(mock);
    const res = await createWorldMap("w1", { label: "Donjon", sort_index: 1 });
    expect(res).toEqual(map);
    expect(mock.buildersFor("world_maps")[0].insert).toHaveBeenCalledWith({
      world_id: "w1",
      label: "Donjon",
      sort_index: 1,
    });
  });

  it("propage l'erreur Supabase", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: { message: "rls" } }] }));
    await expect(createWorldMap("w1", {})).rejects.toThrow("rls");
  });
});

describe("updateWorldMap", () => {
  it("met à jour la carte visée, et elle seule", async () => {
    const map = { id: "m1", world_id: "w1", image_url: "https://img.test/x.jpg", label: "Monde", sort_index: 0 };
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: map }] });
    use(mock);
    const res = await updateWorldMap("m1", { image_url: "https://img.test/x.jpg" });
    expect(res).toEqual(map);
    const b = mock.buildersFor("world_maps")[0];
    expect(b.update).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: "https://img.test/x.jpg" }),
    );
    expect(b.eq).toHaveBeenCalledWith("id", "m1");
  });

  it("propage l'erreur Supabase", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: { message: "rls" } }] }));
    await expect(updateWorldMap("m1", {})).rejects.toThrow("rls");
  });
});

describe("deleteWorldMap", () => {
  it("supprime la carte par id", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] });
    use(mock);
    await deleteWorldMap("m1");
    const b = mock.buildersFor("world_maps")[0];
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith("id", "m1");
  });

  it("propage l'erreur Supabase", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: { message: "rls" } }] }));
    await expect(deleteWorldMap("m1")).rejects.toThrow("rls");
  });
});

describe("updateMapPin", () => {
  it("met à jour les champs du pin", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] });
    use(mock);
    await updateMapPin("p1", { title: "Forteresse", color: "#ff0000" });
    const b = mock.buildersFor("world_map_pins")[0];
    expect(b.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Forteresse", color: "#ff0000" }),
    );
    expect(b.eq).toHaveBeenCalledWith("id", "p1");
  });

  it("propage l'erreur Supabase", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: { message: "not found" } }] }));
    await expect(updateMapPin("p1", { title: "x" })).rejects.toThrow("not found");
  });
});
