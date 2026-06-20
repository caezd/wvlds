import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateChatroomSettings } from "@/app/actions/chatrooms";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => vi.clearAllMocks());

describe("updateChatroomSettings", () => {
  it("rejette un input qui ne respecte pas le schéma zod", async () => {
    await expect(updateChatroomSettings({ id: "pas-un-uuid", title: "" })).rejects.toThrow();
    // Titre vide
    await expect(updateChatroomSettings({ id: ID, title: "" })).rejects.toThrow();
  });

  it("lève « Non authentifié » si aucun utilisateur", async () => {
    const mock = createSupabaseMock({ user: null });
    vi.mocked(createClient).mockResolvedValue(mock.client as never);
    await expect(
      updateChatroomSettings({ id: ID, title: "Salon" }),
    ).rejects.toThrow(/authentifié/i);
  });

  it("normalise les URLs vides en null et met à jour la chatroom", async () => {
    const updated = { id: ID, title: "Salon", banner_url: null, icon_url: null };
    const mock = createSupabaseMock({
      user: { id: "user-1" },
      results: [{ data: updated, error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(mock.client as never);

    const result = await updateChatroomSettings({
      id: ID,
      title: "  Salon  ",
      banner_url: "",
      icon_url: "",
    });

    expect(result).toEqual(updated);
    const builder = mock.buildersFor("chatrooms")[0];
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Salon", banner_url: null, icon_url: null }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/chat/${ID}`);
  });

  it("propage l'erreur Supabase", async () => {
    const mock = createSupabaseMock({
      user: { id: "user-1" },
      results: [{ data: null, error: { message: "boom" } }],
    });
    vi.mocked(createClient).mockResolvedValue(mock.client as never);
    await expect(updateChatroomSettings({ id: ID, title: "Salon" })).rejects.toThrow("boom");
  });
});
