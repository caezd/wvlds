import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  reorderWorldCatalogCategories,
  reorderWorldCatalogItems,
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

// Le réordonnancement du catalogue passe désormais par une RPC (migration
// 162) : une seule requête, un seul résultat. Le piège s'est déplacé sans
// disparaître — une RLS qui refuse ne LÈVE PAS, elle ne met à jour aucune
// ligne. Seul l'écart entre le nombre envoyé et le nombre touché la trahit.

describe("reorderWorldCatalogCategories", () => {
  const cats = [
    { id: "c1", sort_index: 0, column_index: 0 },
    { id: "c2", sort_index: 1, column_index: 0 },
  ];

  it("remonte l'erreur de la RPC", async () => {
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue(boom);
    use(mock);
    expect(await reorderWorldCatalogCategories(cats)).toEqual({
      ok: false,
      error: "saveFailed",
    });
  });

  it("remonte le refus muet d'une RLS", async () => {
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue({ data: 1, error: null });
    use(mock);
    expect(await reorderWorldCatalogCategories(cats)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("confirme le succès quand toutes les lignes sont touchées", async () => {
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue({ data: 2, error: null });
    use(mock);
    expect(await reorderWorldCatalogCategories(cats)).toEqual({ ok: true });
  });
});

describe("reorderWorldCatalogItems", () => {
  const items = [
    { id: "i1", sort_index: 0, category_id: null },
    { id: "i2", sort_index: 1, category_id: "c1" },
  ];

  it("remonte l'erreur de la RPC", async () => {
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue(boom);
    use(mock);
    expect(await reorderWorldCatalogItems(items)).toEqual({
      ok: false,
      error: "saveFailed",
    });
  });

  it("remonte le refus muet d'une RLS", async () => {
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue({ data: 0, error: null });
    use(mock);
    expect(await reorderWorldCatalogItems(items)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("confirme le succès quand toutes les lignes sont touchées", async () => {
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue({ data: 2, error: null });
    use(mock);
    expect(await reorderWorldCatalogItems(items)).toEqual({ ok: true });
  });
});

describe("toggleFollowChatroom", () => {
  it("refuse si non connecté", async () => {
    use(createSupabaseMock({ user: null }));
    expect(await toggleFollowChatroom("chat1", true)).toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  it("remonte l'échec du suivi", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [boom] }));
    expect(await toggleFollowChatroom("chat1", true)).toEqual({
      ok: false,
      error: "saveFailed",
    });
  });

  it("remonte l'échec du retrait de suivi", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [boom] }));
    expect(await toggleFollowChatroom("chat1", false)).toEqual({
      ok: false,
      error: "saveFailed",
    });
  });

  it.each([true, false])("confirme le succès (follow=%s)", async (follow) => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [ok] }));
    expect(await toggleFollowChatroom("chat1", follow)).toEqual({ ok: true });
  });
});
