import { describe, it, expect } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import {
  addPersonasToGroup,
  fetchGroupAssignments,
  removePersonaFromGroup,
  setPrimaryGroup,
} from "@/lib/personaGroupMembership";
import type { SupabaseClient } from "@supabase/supabase-js";

const client = (mock: ReturnType<typeof createSupabaseMock>) => mock.client as unknown as SupabaseClient;

describe("personaGroupMembership", () => {
  it("ajoute plusieurs personas d'un coup, sans doublon pour ceux déjà membres", async () => {
    const mock = createSupabaseMock({ results: [{}] });
    expect(await addPersonasToGroup(client(mock), "w1", "g1", ["p1", "p2", "p1"])).toBe(true);
    const b = mock.buildersFor("persona_group_assignments")[0];
    expect(b.upsert).toHaveBeenCalledWith(
      [
        { persona_id: "p1", world_id: "w1", group_id: "g1" },
        { persona_id: "p2", world_id: "w1", group_id: "g1" },
      ],
      { onConflict: "persona_id,group_id", ignoreDuplicates: true },
    );
  });

  it("n'écrit rien quand la liste est vide", async () => {
    const mock = createSupabaseMock({ results: [] });
    expect(await addPersonasToGroup(client(mock), "w1", "g1", [])).toBe(true);
    expect(mock.buildersFor("persona_group_assignments")).toHaveLength(0);
  });

  it("retire un persona d'un seul groupe", async () => {
    const mock = createSupabaseMock({ results: [{}] });
    expect(await removePersonaFromGroup(client(mock), "p1", "g1")).toBe(true);
    const b = mock.buildersFor("persona_group_assignments")[0];
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith("persona_id", "p1");
    expect(b.eq).toHaveBeenCalledWith("group_id", "g1");
  });

  it("désigne le groupe principal : la base retire ce rang à l'ancien", async () => {
    const mock = createSupabaseMock({ results: [{ data: [{ group_id: "g2" }] }] });
    expect(await setPrimaryGroup(client(mock), "p1", "g2")).toBe(true);
    const b = mock.buildersFor("persona_group_assignments")[0];
    expect(b.update).toHaveBeenCalledWith({ is_primary: true });
    expect(b.eq).toHaveBeenCalledWith("persona_id", "p1");
    expect(b.eq).toHaveBeenCalledWith("group_id", "g2");
  });

  it("un groupe principal que la RLS n'a pas laissé écrire compte comme un échec", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }] });
    expect(await setPrimaryGroup(client(mock), "p1", "g2")).toBe(false);
  });

  it("une erreur d'écriture renvoie false", async () => {
    const mock = createSupabaseMock({ results: [{ error: { message: "rls" } }] });
    expect(await removePersonaFromGroup(client(mock), "p1", "g1")).toBe(false);
  });

  it("relit les affectations du monde, groupe principal compris", async () => {
    const rows = [{ persona_id: "p1", group_id: "g1", is_primary: true }];
    const mock = createSupabaseMock({ results: [{ data: rows }] });
    expect(await fetchGroupAssignments(client(mock), "w1")).toEqual(rows);
    const b = mock.buildersFor("persona_group_assignments")[0];
    expect(b.select).toHaveBeenCalledWith("persona_id, group_id, is_primary");
    expect(b.eq).toHaveBeenCalledWith("world_id", "w1");
  });
});
