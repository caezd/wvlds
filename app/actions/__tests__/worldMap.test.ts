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
  setPersonaLocation,
  createMapRegion,
  updateMapRegion,
  deleteMapRegion,
  createPinLink,
  updatePinLink,
  deletePinLink,
} from "@/app/actions/worldMap";
import { createClient } from "@/lib/supabase/server";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

describe("getWorldMaps", () => {
  it("retourne les cartes, les pins et les régions, avec fallbacks vides", async () => {
    const maps = [
      { id: "m1", world_id: "w1", image_url: null, label: "Continent", sort_index: 0 },
      { id: "m2", world_id: "w1", image_url: null, label: "Donjon", sort_index: 1 },
    ];
    const pins = [{ id: "p1", world_id: "w1", map_id: "m1", title: "Port" }];
    const regions = [{ id: "r1", map_id: "m1", label: "Le royaume", points: [] }];
    const links = [{ id: "l1", map_id: "m1", from_pin_id: "p1", to_pin_id: "p2", label: "" }];
    use(createSupabaseMock({ results: [{ data: maps }, { data: pins }, { data: regions }, { data: links }] }));
    const res = await getWorldMaps("w1");
    expect(res.maps).toEqual(maps);
    expect(res.pins).toEqual(pins);
    expect(res.regions).toEqual(regions);
    expect(res.links).toEqual(links);
  });

  it("retourne des listes vides quand rien n'existe", async () => {
    use(createSupabaseMock({ results: [{ data: null }, { data: null }] }));
    const res = await getWorldMaps("w1");
    expect(res.maps).toEqual([]);
    expect(res.pins).toEqual([]);
    expect(res.regions).toEqual([]);
    expect(res.links).toEqual([]);
  });
});

describe("createPinLink", () => {
  it("range la paire avant de l'écrire", async () => {
    // Un lien n'a pas de sens, et c'est ce rangement qui permet à une simple
    // clé unique d'interdire le doublon inverse (migration 166) : cliquer B
    // puis A ne doit pas poser un second trait.
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: { id: "l1" } }] });
    use(mock);

    await createPinLink("w1", "m1", "bbb", "aaa");

    expect(mock.buildersFor("world_map_pin_links")[0].insert).toHaveBeenCalledWith({
      world_id: "w1",
      map_id: "m1",
      from_pin_id: "aaa",
      to_pin_id: "bbb",
    });
  });

  it("propage l'erreur Supabase — le doublon en est une", async () => {
    use(createSupabaseMock({
      user: { id: "u1" },
      results: [{ error: { message: 'duplicate key value violates unique constraint "world_map_pin_links_pair_key"' } }],
    }));
    await expect(createPinLink("w1", "m1", "a", "b")).rejects.toThrow("world_map_pin_links_pair_key");
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
    ["setPersonaLocation", () => setPersonaLocation("per1", "p1")],
    ["createMapRegion", () => createMapRegion("w1", "m1", { label: "x", points: [], color: "#000" })],
    ["updateMapRegion", () => updateMapRegion("r1", { label: "x" })],
    ["deleteMapRegion", () => deleteMapRegion("r1")],
    ["createPinLink", () => createPinLink("w1", "m1", "a", "b")],
    ["updatePinLink", () => updatePinLink("l1", { label: "x" })],
    ["deletePinLink", () => deletePinLink("l1")],
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
    // Deux passages sur la table : la bannière est relevée avant la
    // suppression, sans quoi plus rien ne dirait quel fichier effacer.
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: { banner_url: null } }, { error: null }],
    });
    use(mock);
    await deleteMapPin("p1");
    const b = mock.buildersFor("world_map_pins")[1];
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
    // Le premier résultat sert au relevé de l'image d'avant.
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: { image_url: null } }, { data: map }],
    });
    use(mock);
    const res = await updateWorldMap("m1", { image_url: "https://img.test/x.jpg" });
    expect(res).toEqual(map);
    const b = mock.buildersFor("world_maps")[1];
    expect(b.update).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: "https://img.test/x.jpg" }),
    );
    expect(b.eq).toHaveBeenCalledWith("id", "m1");
  });

  it("propage l'erreur Supabase", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: { message: "rls" } }] }));
    await expect(updateWorldMap("m1", { label: "x" })).rejects.toThrow("rls");
  });
});

describe("deleteWorldMap", () => {
  it("supprime la carte par id", async () => {
    // Trois passages : l'image de la carte, les bannières de ses lieux, puis
    // la suppression elle-même.
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: { image_url: null } }, { data: [] }, { error: null }],
    });
    use(mock);
    await deleteWorldMap("m1");
    const b = mock.buildersFor("world_maps")[1];
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith("id", "m1");
  });

  it("propage l'erreur Supabase", async () => {
    use(createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: { image_url: null } }, { data: [] }, { error: { message: "rls" } }],
    }));
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

// ──────────────────────────────────────────────────────────────────────────
// `ON DELETE CASCADE` ne parle qu'à Postgres : les fichiers, eux, restaient.
// Chaque carte supprimée ou remplacée laissait son image dans le bucket, pour
// toujours — et rien ne disait plus à qui elle avait appartenu.
// ──────────────────────────────────────────────────────────────────────────

const BUCKET = "https://x.supabase.co/storage/v1/object/public/worlds";

describe("ménage du stockage", () => {
  it("efface l'image de la carte et les bannières de ses lieux", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: { image_url: `${BUCKET}/world-w1/map-m1/carte.webp` } },
        { data: [{ banner_url: `${BUCKET}/world-w1/pin-p1/banniere.webp` }, { banner_url: null }] },
        { error: null },
      ],
    });
    use(mock);

    await deleteWorldMap("m1");

    expect(mock.storageRemove).toHaveBeenCalledWith([
      "world-w1/map-m1/carte.webp",
      "world-w1/pin-p1/banniere.webp",
    ]);
  });

  it("efface l'image remplacée d'une carte", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: { image_url: `${BUCKET}/world-w1/map-m1/ancienne.webp` } },
        { data: { id: "m1", image_url: `${BUCKET}/world-w1/map-m1/nouvelle.webp` } },
      ],
    });
    use(mock);

    await updateWorldMap("m1", { image_url: `${BUCKET}/world-w1/map-m1/nouvelle.webp` });

    expect(mock.storageRemove).toHaveBeenCalledWith(["world-w1/map-m1/ancienne.webp"]);
  });

  it("ne touche à rien quand la mise à jour ne concerne pas l'image", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: { id: "m1" } }] });
    use(mock);

    await updateWorldMap("m1", { label: "Donjon" });

    expect(mock.storageRemove).not.toHaveBeenCalled();
  });

  it("efface la bannière d'un lieu supprimé", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: { banner_url: `${BUCKET}/world-w1/pin-p1/b.webp` } }, { error: null }],
    });
    use(mock);

    await deleteMapPin("p1");

    expect(mock.storageRemove).toHaveBeenCalledWith(["world-w1/pin-p1/b.webp"]);
  });

  it("ne fait pas échouer la suppression quand le ménage échoue", async () => {
    // La ligne est déjà supprimée : rendre une erreur ici afficherait
    // « suppression impossible » pour une carte qui a bel et bien disparu.
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: { image_url: `${BUCKET}/world-w1/map-m1/c.webp` } }, { data: [] }, { error: null }],
    });
    mock.storageRemove.mockRejectedValueOnce(new Error("storage indisponible"));
    use(mock);

    await expect(deleteWorldMap("m1")).resolves.toBeUndefined();
  });
});

describe("setPersonaLocation", () => {
  it("pose le persona sur le lieu", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] });
    use(mock);
    await setPersonaLocation("per1", "p1");
    const b = mock.buildersFor("personas")[0];
    expect(b.update).toHaveBeenCalledWith({ map_pin_id: "p1" });
    expect(b.eq).toHaveBeenCalledWith("id", "per1");
  });

  it("le retire de la carte avec null", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] });
    use(mock);
    await setPersonaLocation("per1", null);
    expect(mock.buildersFor("personas")[0].update).toHaveBeenCalledWith({ map_pin_id: null });
  });

  it("propage le refus de la RLS — le persona d'un autre ne bouge pas", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: { message: "rls" } }] }));
    await expect(setPersonaLocation("per-autrui", "p1")).rejects.toThrow("rls");
  });
});


describe("régions", () => {
  const POINTS = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];

  it("crée une région sur sa carte et la retourne", async () => {
    const region = { id: "r1", world_id: "w1", map_id: "m1", label: "Le royaume", points: POINTS, color: "#22c55e" };
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: region }] });
    use(mock);
    const res = await createMapRegion("w1", "m1", { label: "Le royaume", points: POINTS, color: "#22c55e" });
    expect(res).toEqual(region);
    expect(mock.buildersFor("world_map_regions")[0].insert).toHaveBeenCalledWith({
      world_id: "w1",
      map_id: "m1",
      label: "Le royaume",
      points: POINTS,
      color: "#22c55e",
    });
  });

  it("met à jour la région visée, et elle seule", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] });
    use(mock);
    await updateMapRegion("r1", { points: POINTS });
    const b = mock.buildersFor("world_map_regions")[0];
    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({ points: POINTS }));
    expect(b.eq).toHaveBeenCalledWith("id", "r1");
  });

  it("supprime par id", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ error: null }] });
    use(mock);
    await deleteMapRegion("r1");
    const b = mock.buildersFor("world_map_regions")[0];
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith("id", "r1");
  });

  it("propage l'erreur Supabase", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ error: { message: "rls" } }] }));
    await expect(updateMapRegion("r1", { label: "x" })).rejects.toThrow("rls");
  });
});
