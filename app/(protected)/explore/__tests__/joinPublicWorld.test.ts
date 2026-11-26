import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { joinPublicWorld } from "../actions";

beforeEach(() => vi.clearAllMocks());

describe("joinPublicWorld (migration 266)", () => {
  it("transmet la date de naissance saisie à la confirmation d'âge", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockResolvedValue(mock.client as never);
    await joinPublicWorld("w1", true, "1990-06-15");
    expect(mock.rpc).toHaveBeenCalledWith("join_public_world", {
      p_world_id: "w1",
      p_age_confirmed: true,
      p_birth_date: "1990-06-15",
    });
  });

  it("sans date : la base s'en tient à celle du compte", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockResolvedValue(mock.client as never);
    await joinPublicWorld("w1", false);
    expect(mock.rpc).toHaveBeenCalledWith("join_public_world", {
      p_world_id: "w1",
      p_age_confirmed: false,
      p_birth_date: null,
    });
  });
});
