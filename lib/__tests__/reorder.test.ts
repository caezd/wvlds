import { describe, it, expect, vi } from "vitest";
import { reorderRows, REORDER_REFUSED } from "@/lib/reorder";

describe("reorderRows", () => {
  const LISTE = [{ id: "a", sort_index: 0 }, { id: "b", sort_index: 1 }];

  it("envoie toute la liste en UNE requête", async () => {
    const rpc = vi.fn(async () => ({ data: 2, error: null }));
    expect(await reorderRows({ rpc }, "reorder_world_maps", LISTE)).toEqual({ error: null });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("reorder_world_maps", { p_items: LISTE });
  });

  it("une liste vide ne part pas", async () => {
    const rpc = vi.fn();
    expect(await reorderRows({ rpc }, "reorder_world_maps", [])).toEqual({ error: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("des lignes manquantes (refus silencieux de la RLS) sont un refus", async () => {
    const rpc = vi.fn(async () => ({ data: 1, error: null }));
    expect(await reorderRows({ rpc }, "reorder_world_maps", LISTE)).toEqual({ error: REORDER_REFUSED });
  });

  it("remonte l'erreur de la base", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    expect(await reorderRows({ rpc }, "reorder_world_maps", LISTE)).toEqual({ error: "boom" });
  });
});
