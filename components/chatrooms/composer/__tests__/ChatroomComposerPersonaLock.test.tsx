import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const currentUserMock = vi.hoisted(() => ({ plan: "free" as string | null }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "u1", username: "tester", plan: currentUserMock.plan }),
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({
    chatroom_media: false,
    chatroom_blocks: false,
    block_npc: false,
    block_hp: false,
  }),
}));
vi.mock("@/lib/crypto", () => ({
  encryptMessage: vi.fn(async (text: string) => text),
}));
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea data-testid="editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/personas/PersonaPickerDialog", () => ({
  PersonaPickerDialog: () => null,
}));

import { ChatroomComposer } from "@/components/chatrooms/composer/ChatroomComposer";

// 6 personas non-templates du monde w1, appartenant à u1 ; p6 est le plus
// récent (6e rang chronologique) -> inéligible en plan gratuit.
const worldPersonas = [
  { id: "p1", created_at: "2026-01-01T00:00:00Z", is_template: false },
  { id: "p2", created_at: "2026-01-02T00:00:00Z", is_template: false },
  { id: "p3", created_at: "2026-01-03T00:00:00Z", is_template: false },
  { id: "p4", created_at: "2026-01-04T00:00:00Z", is_template: false },
  { id: "p5", created_at: "2026-01-05T00:00:00Z", is_template: false },
  { id: "p6", created_at: "2026-01-06T00:00:00Z", is_template: false },
];

const eligiblePersona: Persona = { id: "p1", user_id: "u1", name: "Alpha", avatar_url: null };
const lockedPersona: Persona = { id: "p6", user_id: "u1", name: "Zeta", avatar_url: null };

function setup(plan: string | null = "free") {
  currentUserMock.plan = plan;
  const mock = createSupabaseMock({
    user: { id: "u1" },
    results: [{ data: worldPersonas, error: null }], // requête d'éligibilité (personas du monde)
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChatroomComposer — verrouillage d'envoi selon l'éligibilité du persona", () => {
  it("désactive Envoyer pour un persona au-delà du quota gratuit, même avec du texte", async () => {
    setup("free");
    const user = userEvent.setup();
    render(
      <ChatroomComposer chatId="chat1" worldId="w1" presetPersona={lockedPersona} />,
    );
    await user.type(screen.getByTestId("editor"), "Bonjour");

    await waitFor(() => {
      expect(screen.getByTitle(/plan gratuit/i)).toBeDisabled();
    });
  });

  it("laisse Envoyer actif pour un persona dans les 5 premiers", async () => {
    setup("free");
    const user = userEvent.setup();
    render(
      <ChatroomComposer chatId="chat1" worldId="w1" presetPersona={eligiblePersona} />,
    );
    await user.type(screen.getByTestId("editor"), "Bonjour");

    await waitFor(() => {
      expect(screen.getByTitle("Envoyer")).not.toBeDisabled();
    });
  });

  it("laisse Envoyer actif pour un compte abonné, même avec le 6e persona", async () => {
    setup("subscribed");
    const user = userEvent.setup();
    render(
      <ChatroomComposer chatId="chat1" worldId="w1" presetPersona={lockedPersona} />,
    );
    await user.type(screen.getByTestId("editor"), "Bonjour");

    await waitFor(() => {
      expect(screen.getByTitle("Envoyer")).not.toBeDisabled();
    });
  });
});
