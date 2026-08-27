import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  batchUpdateCatalogCategoryOrder,
  batchUpdateCatalogItemOrder,
} from "@/app/actions/worldCatalog";
import { toggleFollowChatroom } from "@/app/(protected)/w/actions";
import { createClient } from "@/lib/supabase/server";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

// ──────────────────────────────────────────────────────────────────────────
// Ces trois actions annonçaient un succès sans jamais regarder le résultat de
// leurs écritures. Comme l'interface se met à jour de façon optimiste, un
// refus RLS ou une coupure réseau laissait l'utilisateur devant un changement
// qui semblait enregistré et disparaissait au rechargement suivant.
// ──────────────────────────────────────────────────────────────────────────

const boom = { data: null, error: { message: "refusé par la RLS" } };
const ok = { data: null, error: null };

describe("batchUpdateCatalogCategoryOrder", () => {
  const cats = [
    { id: "c1", sort_index: 0, column_index: 0 },
    { id: "c2", sort_index: 1, column_index: 0 },
  ];

  it("remonte l'échec d'une des écritures", async () => {
    use(createSupabaseMock({ results: [ok, boom] }));
    expect(await batchUpdateCatalogCategoryOrder(cats)).toEqual({
      ok: false,
      error: "refusé par la RLS",
    });
  });

  it("confirme le succès quand toutes les écritures passent", async () => {
    use(createSupabaseMock({ results: [ok, ok] }));
    expect(await batchUpdateCatalogCategoryOrder(cats)).toEqual({ ok: true });
  });
});

describe("batchUpdateCatalogItemOrder", () => {
  const items = [
    { id: "i1", sort_index: 0, category_id: null },
    { id: "i2", sort_index: 1, category_id: "c1" },
  ];

  it("remonte l'échec d'une des écritures", async () => {
    use(createSupabaseMock({ results: [boom, ok] }));
    expect(await batchUpdateCatalogItemOrder(items, "inventory")).toEqual({
      ok: false,
      error: "refusé par la RLS",
    });
  });

  it.each(["inventory", "skills"] as const)(
    "confirme le succès pour %s",
    async (type) => {
      use(createSupabaseMock({ results: [ok, ok] }));
      expect(await batchUpdateCatalogItemOrder(items, type)).toEqual({ ok: true });
    },
  );
});

describe("toggleFollowChatroom", () => {
  it("refuse si non connecté", async () => {
    use(createSupabaseMock({ user: null }));
    expect(await toggleFollowChatroom("chat1", true)).toEqual({
      ok: false,
      error: "Non authentifié.",
    });
  });

  it("remonte l'échec du suivi", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [boom] }));
    expect(await toggleFollowChatroom("chat1", true)).toEqual({
      ok: false,
      error: "refusé par la RLS",
    });
  });

  it("remonte l'échec du retrait de suivi", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [boom] }));
    expect(await toggleFollowChatroom("chat1", false)).toEqual({
      ok: false,
      error: "refusé par la RLS",
    });
  });

  it.each([true, false])("confirme le succès (follow=%s)", async (follow) => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [ok] }));
    expect(await toggleFollowChatroom("chat1", follow)).toEqual({ ok: true });
  });
});
