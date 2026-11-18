import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";

// ──────────────────────────────────────────────────────────────────────────
// Ouvrir un salon depuis le composeur du monde : les options cochées là
// (dialogue en bulles, sa couleur, SMS) étaient mémorisées sous la clé `…:new`,
// et le composeur du salon créé les cherchait sous `…:<id>`. Cochées dans le
// monde, elles apparaissaient décochées dans le salon.
// ──────────────────────────────────────────────────────────────────────────

const stockage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => stockage[k] ?? null,
  setItem: (k: string, v: string) => { stockage[k] = v; },
  removeItem: (k: string) => { delete stockage[k]; },
  clear: () => { for (const k of Object.keys(stockage)) delete stockage[k]; },
});

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "u1", username: "tester", plan: "subscribed" }),
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ chatroom_media: false, chatroom_blocks: false, block_npc: false, block_hp: false }),
}));
vi.mock("@/lib/crypto", () => ({ encryptMessage: vi.fn(async (text: string) => text) }));
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/personas/PersonaPickerDialog", () => ({ PersonaPickerDialog: () => null }));

import { ChatroomComposer } from "@/components/chatrooms/composer/ChatroomComposer";

const persona: Persona = { id: "p1", user_id: "u1", name: "Alpha", avatar_url: null };

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(stockage)) delete stockage[k];
  const mock = createSupabaseMock({
    user: { id: "u1" },
    // Les premières lectures (éligibilité, liste des personas) attendent toutes
    // une liste : la même pour chacune, quel que soit leur ordre d'arrivée.
    results: Array.from({ length: 4 }, () => ({
      data: [{ id: "p1", user_id: "u1", name: "Alpha", created_at: "2026-01-01T00:00:00Z", is_template: false }],
      error: null,
    })),
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
});

describe("ChatroomComposer — création d'un salon depuis le monde", () => {
  it("le salon créé hérite du dialogue en bulles, de sa couleur et du mode SMS", async () => {
    stockage["bubbleMode:new"] = "1";
    stockage["bubbleColor:new"] = "#f27a12";
    stockage["smsMode:new"] = "1";
    const user = userEvent.setup();
    render(
      <ChatroomComposer
        worldId="w1"
        presetPersona={persona}
        onResolveChat={async () => ({ chatId: "c-neuf" })}
      />,
    );

    await user.type(screen.getByTestId("editor"), "Bonjour");
    await waitFor(() => expect(screen.getByTitle("Envoyer")).not.toBeDisabled());
    await user.click(screen.getByTitle("Envoyer"));

    await waitFor(() => expect(stockage["bubbleMode:c-neuf"]).toBe("1"));
    expect(stockage["bubbleColor:c-neuf"]).toBe("#f27a12");
    expect(stockage["smsMode:c-neuf"]).toBe("1");
    // Le prochain salon créé part des mêmes réglages.
    expect(stockage["bubbleMode:new"]).toBe("1");
  });

  it("une option décochée dans le monde ne s'allume pas dans le salon", async () => {
    stockage["bubbleMode:c-neuf"] = "1"; // reste d'une session précédente
    const user = userEvent.setup();
    render(
      <ChatroomComposer
        worldId="w1"
        presetPersona={persona}
        onResolveChat={async () => ({ chatId: "c-neuf" })}
      />,
    );

    await user.type(screen.getByTestId("editor"), "Bonjour");
    await waitFor(() => expect(screen.getByTitle("Envoyer")).not.toBeDisabled());
    await user.click(screen.getByTitle("Envoyer"));

    await waitFor(() => expect(stockage["bubbleMode:c-neuf"]).toBeUndefined());
  });
});
