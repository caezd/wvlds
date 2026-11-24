import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createSupabaseMock, type QueryResult } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { usePersonaTints } from "@/hooks/usePersonaTints";
import { createClient } from "@/lib/supabase/client";

const groupe = (id: string, color: string | null, extra: Record<string, unknown> = {}) => ({
  id, name: id, color, parent_id: null, sort_index: 0, apply_color: true, ...extra,
});

function setup(results: QueryResult[], worldId: string | null = "w1", enabled = true) {
  const mock = createSupabaseMock({ results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  const view = renderHook(({ w, e }) => usePersonaTints(w, e), { initialProps: { w: worldId, e: enabled } });
  return { mock, view };
}

beforeEach(() => vi.clearAllMocks());

describe("usePersonaTints", () => {
  it("la teinte de chaque persona, d'après son groupe (couleur héritée du parent comprise)", async () => {
    const { mock, view } = setup([
      {
        data: [
          groupe("g1", "#22c55e"),
          groupe("g2", null, { parent_id: "g1" }),
          groupe("g3", "#ef4444", { apply_color: false }),
        ],
      },
      {
        data: [
          { persona_id: "p1", group_id: "g1" },
          { persona_id: "p2", group_id: "g2" },
          { persona_id: "p3", group_id: "g3" },
        ],
      },
    ]);
    await waitFor(() => expect(view.result.current).toEqual({ p1: "#22c55e", p2: "#22c55e" }));
    expect(mock.buildersFor("world_persona_groups")[0].eq).toHaveBeenCalledWith("world_id", "w1");
    expect(mock.buildersFor("persona_group_assignments")[0].eq).toHaveBeenCalledWith("world_id", "w1");
  });

  it("rien à charger quand les personas ne sont pas permis, ou hors d'un monde", () => {
    const off = setup([], "w1", false);
    expect(off.view.result.current).toEqual({});
    expect(off.mock.client.from).not.toHaveBeenCalled();

    const sansMonde = setup([], null, true);
    expect(sansMonde.view.result.current).toEqual({});
    expect(sansMonde.mock.client.from).not.toHaveBeenCalled();
  });
});
