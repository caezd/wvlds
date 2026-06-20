import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createPersona, deletePersona } from "@/app/(protected)/p/actions";
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
