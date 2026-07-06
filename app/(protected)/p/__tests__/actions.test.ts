import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createPersona,
  deletePersona,
  movePersona,
  duplicatePersona,
} from "@/app/(protected)/p/actions";
import { createClient } from "@/lib/supabase/server";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => vi.clearAllMocks());

describe("createPersona", () => {
  it("refuse si non connecté", async () => {
    use(createSupabaseMock({ user: null }));
    const res = await createPersona(null, fd({ name: "Aria" }));
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/connecté/i) });
  });

  it("refuse un nom vide", async () => {
    use(createSupabaseMock({ user: { id: "u1" } }));
    const res = await createPersona(null, fd({ name: "   " }));
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/1 et 40/) });
  });

  it("refuse un nom de plus de 40 caractères", async () => {
    use(createSupabaseMock({ user: { id: "u1" } }));
    const res = await createPersona(null, fd({ name: "x".repeat(41) }));
    expect(res).toMatchObject({ ok: false });
  });

  it("traduit l'erreur P0001 en message de quota", async () => {
    use(createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: null, error: { code: "P0001", message: "raw" } }],
    }));
    const res = await createPersona(null, fd({ name: "Aria" }));
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/Limite atteinte/) });
  });

  it("crée le persona et retourne son id", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: { id: "persona-1" }, error: null }],
    });
    use(mock);
    const res = await createPersona(null, fd({ name: "Aria", world_id: "w1" }));
    expect(res).toEqual({ ok: true, id: "persona-1" });
    expect(mock.buildersFor("personas")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", name: "Aria", world_id: "w1" }),
    );
  });

  it("copie la fiche par défaut du monde (grilles d'images vidées)", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: { id: "persona-1" }, error: null },          // insert persona
        { data: { id: "tpl1" } },                            // lookup fiche modèle
        { data: [{ id: "ts1", name: "Identité", position: 0 }] }, // sections du modèle
        { data: [{ id: "ns1", position: 0 }] },              // insert sections
        {
          data: [
            { id: "tf1", section_id: "ts1", type: "text", label: null, position: 0, data: { text: "" }, locked: true },
            { id: "tf2", section_id: "ts1", type: "image-grid", label: null, position: 10, data: { images: [{ id: "img", url: "u" }] } },
          ],
        },                                                    // champs du modèle
        { data: [{ id: "nf1" }, { id: "nf2" }] },            // insert champs
      ],
    });
    use(mock);
    const res = await createPersona(null, fd({ name: "Aria", world_id: "w1" }));
    expect(res).toEqual({ ok: true, id: "persona-1" });
    expect(mock.buildersFor("persona_sections")[1].insert).toHaveBeenCalledWith([
      { persona_id: "persona-1", name: "Identité", position: 0 },
    ]);
    // Le verrou du modèle est propagé, les grilles d'images sont vidées
    expect(mock.buildersFor("persona_section_fields")[1].insert).toHaveBeenCalledWith([
      { section_id: "ns1", type: "text", label: null, position: 0, data: { text: "" }, locked: true },
      { section_id: "ns1", type: "image-grid", label: null, position: 10, data: { images: [] }, locked: false },
    ]);
  });

  it("sans fiche par défaut : aucune copie de sections", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: { id: "persona-1" }, error: null }, // insert persona
        { data: null },                             // lookup fiche modèle : aucune
      ],
    });
    use(mock);
    const res = await createPersona(null, fd({ name: "Aria", world_id: "w1" }));
    expect(res).toEqual({ ok: true, id: "persona-1" });
    expect(mock.buildersFor("persona_sections")).toHaveLength(0);
  });

  it("sans monde : ne cherche pas de fiche par défaut", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: { id: "persona-1" }, error: null }],
    });
    use(mock);
    const res = await createPersona(null, fd({ name: "Aria" }));
    expect(res).toEqual({ ok: true, id: "persona-1" });
    expect(mock.buildersFor("personas")).toHaveLength(1); // insert seulement
  });
});

describe("deletePersona", () => {
  it("refuse si non connecté", async () => {
    use(createSupabaseMock({ user: null }));
    expect(await deletePersona("p1")).toMatchObject({ ok: false });
  });

  it("retourne une erreur si le persona est introuvable / non autorisé", async () => {
    // 1) select persona  2) select sections  3) delete -> data null
    use(createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: { avatar_url: null, banner_url: null, world_id: null } },
        { data: [] },
        { data: null, error: null },
      ],
    }));
    const res = await deletePersona("p1");
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/introuvable|autoris/i) });
  });

  it("supprime avec succès", async () => {
    use(createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: { avatar_url: null, banner_url: null, world_id: "w1" } },
        { data: [] },
        { data: { id: "p1" }, error: null },
      ],
    }));
    expect(await deletePersona("p1")).toEqual({ ok: true });
  });
});

describe("movePersona", () => {
  it("refuse si non connecté", async () => {
    use(createSupabaseMock({ user: null }));
    expect(await movePersona("p1", "w2")).toMatchObject({ ok: false });
  });

  it("retourne une erreur si le persona est introuvable / non autorisé", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ data: null }] }));
    const res = await movePersona("p1", "w2");
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/introuvable|autoris/i) });
  });

  it("ne fait rien si le persona est déjà dans le monde cible", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: { id: "p1", world_id: "w2" } }],
    });
    use(mock);
    expect(await movePersona("p1", "w2")).toEqual({ ok: true });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("refuse si le quota du monde cible est atteint", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [{ data: { id: "p1", world_id: "w1" } }],
    });
    mock.rpc.mockResolvedValue({ data: false, error: null });
    use(mock);
    const res = await movePersona("p1", "w2");
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/Limite atteinte/) });
  });

  it("déplace le persona vers le monde cible", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: { id: "p1", world_id: "w1" } },
        { data: null, error: null }, // update
      ],
    });
    mock.rpc.mockResolvedValue({ data: true, error: null });
    use(mock);
    expect(await movePersona("p1", "w2")).toEqual({ ok: true });
    expect(mock.rpc).toHaveBeenCalledWith("has_persona_capacity", { u: "u1", w: "w2" });
    expect(mock.buildersFor("personas")[1].update).toHaveBeenCalledWith({ world_id: "w2" });
  });

  it("traduit l'erreur 23505 (nom déjà pris dans le monde cible)", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: { id: "p1", world_id: "w1" } },
        { data: null, error: { code: "23505", message: "duplicate key value" } },
      ],
    });
    mock.rpc.mockResolvedValue({ data: true, error: null });
    use(mock);
    const res = await movePersona("p1", "w2");
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/nom existe déjà/i) });
  });

  it("déplace vers « sans monde » (world_id null)", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: { id: "p1", world_id: "w1" } },
        { data: null, error: null },
      ],
    });
    mock.rpc.mockResolvedValue({ data: true, error: null });
    use(mock);
    expect(await movePersona("p1", null)).toEqual({ ok: true });
    expect(mock.buildersFor("personas")[1].update).toHaveBeenCalledWith({ world_id: null });
  });
});

describe("duplicatePersona", () => {
  const source = {
    id: "p1",
    user_id: "u1",
    name: "Aria",
    bio: "bio",
    avatar_url: null,
    avatar_config: { v: 1 },
    avatar_frame_id: "frame-1",
    banner_url: null,
    world_id: "w1",
  };

  it("refuse si non connecté", async () => {
    use(createSupabaseMock({ user: null }));
    expect(await duplicatePersona("p1", "w2")).toMatchObject({ ok: false });
  });

  it("retourne une erreur si le persona est introuvable / non autorisé", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ data: null }] }));
    const res = await duplicatePersona("p1", "w2");
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/introuvable|autoris/i) });
  });

  it("traduit l'erreur P0001 en message de quota", async () => {
    use(createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: source },
        { data: null, error: { code: "P0001", message: "raw" } },
      ],
    }));
    const res = await duplicatePersona("p1", "w2");
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/Limite atteinte/) });
  });

  it("traduit l'erreur 23505 (nom déjà pris dans le monde cible)", async () => {
    use(createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: source },
        { data: null, error: { code: "23505", message: "duplicate key value" } },
      ],
    }));
    const res = await duplicatePersona("p1", "w2");
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/nom existe déjà/i) });
  });

  it("copie la ligne persona vers le monde cible", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: source },
        { data: { id: "p2" }, error: null }, // insert persona
        { data: [] }, // select sections
      ],
    });
    use(mock);
    const res = await duplicatePersona("p1", "w2");
    expect(res).toEqual({ ok: true, id: "p2" });
    expect(mock.buildersFor("personas")[1].insert).toHaveBeenCalledWith({
      user_id: "u1",
      name: "Aria",
      bio: "bio",
      avatar_config: { v: 1 },
      avatar_frame_id: "frame-1",
      world_id: "w2",
    });
  });

  it("recopie l'avatar vers un chemin propre au nouveau persona", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [
        {
          data: {
            ...source,
            avatar_url:
              "https://x.supabase.co/storage/v1/object/public/personas/user-u1/avatar/p1.webp?t=123",
          },
        },
        { data: { id: "p2" }, error: null }, // insert persona
        { data: null, error: null }, // update avatar_url
        { data: [] }, // select sections
      ],
    });
    use(mock);
    expect(await duplicatePersona("p1", "w2")).toEqual({ ok: true, id: "p2" });
    expect(mock.storageCopy).toHaveBeenCalledWith(
      "user-u1/avatar/p1.webp",
      "user-u1/avatar/p2.webp",
    );
    expect(mock.buildersFor("personas")[2].update).toHaveBeenCalledWith(
      expect.objectContaining({
        avatar_url: expect.stringContaining("user-u1/avatar/p2.webp"),
      }),
    );
  });

  it("copie les sections et leurs champs", async () => {
    const mock = createSupabaseMock({
      user: { id: "u1" },
      results: [
        { data: source },
        { data: { id: "p2" }, error: null }, // insert persona
        { data: [{ id: "s1", name: "Identité", position: 0 }] }, // select sections
        { data: [{ id: "s1n", position: 0 }] }, // insert sections
        {
          data: [
            { id: "f1", section_id: "s1", type: "text", label: null, position: 0, data: { text: "x" }, locked: true },
          ],
        }, // select fields
        { data: [{ id: "f1n" }] }, // insert fields
      ],
    });
    use(mock);
    expect(await duplicatePersona("p1", "w2")).toEqual({ ok: true, id: "p2" });
    expect(mock.buildersFor("persona_sections")[1].insert).toHaveBeenCalledWith([
      { persona_id: "p2", name: "Identité", position: 0 },
    ]);
    // La duplication ne propage pas les verrous (liés au modèle du monde d'origine)
    expect(mock.buildersFor("persona_section_fields")[1].insert).toHaveBeenCalledWith([
      { section_id: "s1n", type: "text", label: null, position: 0, data: { text: "x" }, locked: false },
    ]);
  });
});
