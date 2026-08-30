import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  getWorldMap,
  upsertWorldMap,
  createMapPin,
  updateMapPin,
  deleteMapPin,
} from "@/app/actions/worldMap";
import { createClient } from "@/lib/supabase/server";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

describe("getWorldMap", () => {
  it("retourne la carte et les pins, avec fallbacks vides", async () => {
    const map = { id: "m1", world_id: "w1", image_url: null, label: "Carte" };
    const pins = [{ id: "p1", world_id: "w1", title: "Donjon" }];
    use(createSupabaseMock({ results: [{ data: map }, { data: pins }] }));
    const res = await getWorldMap("w1");
    expect(res.map).toEqual(map);
    expect(res.pins).toEqual(pins);
  });

  it("retourne map=null et pins=[] quand rien n'existe", async () => {
    use(createSupabaseMock({ results: [{ data: null }, { data: null }] }));
    const res = await getWorldMap("w1");
    expect(res.map).toBeNull();
    expect(res.pins).toEqual([]);
  });
});

describe("mutations carte — garde d'authentification", () => {
  it.each([
    ["upsertWorldMap", () => upsertWorldMap("w1", { label: "x" })],
    ["createMapPin", () => createMapPin("w1", 1, 2, "Pin")],
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
    const pin = { id: "p1", world_id: "w1", x: 10, y: 20, title: "Donjon" };
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: pin }] });
    use(mock);
    const res = await createMapPin("w1", 10, 20, "Donjon");
    expect(res).toEqual(pin);
    expect(mock.buildersFor("world_map_pins")[0].insert).toHaveBeenCalledWith({
      world_id: "w1",
      x: 10,
      y: 20,
      title: "Donjon",
    });
  });

  it("propage l'erreur Supabase", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: { message: "rls" } }] }));
    await expect(createMapPin("w1", 0, 0, "x")).rejects.toThrow("rls");
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

describe("upsertWorldMap", () => {
  it("upsert la carte avec le patch et retourne la donnée", async () => {
    const map = { id: "m1", world_id: "w1", image_url: "https://img.test/x.jpg", label: "Monde" };
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: map }] });
    use(mock);
    const res = await upsertWorldMap("w1", { image_url: "https://img.test/x.jpg", label: "Monde" });
    expect(res).toEqual(map);
    const b = mock.buildersFor("world_maps")[0];
    expect(b.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ world_id: "w1", image_url: "https://img.test/x.jpg", label: "Monde" }),
      { onConflict: "world_id" },
    );
  });

  it("propage l'erreur Supabase", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: { message: "rls" } }] }));
    await expect(upsertWorldMap("w1", {})).rejects.toThrow("rls");
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
