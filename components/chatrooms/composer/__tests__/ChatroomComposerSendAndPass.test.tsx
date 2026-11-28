import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "u1", username: "tester", plan: "subscribed" }),
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ chatroom_media: false, chatroom_blocks: false, block_npc: false, block_hp: false }),
}));
vi.mock("@/lib/crypto", () => ({ encryptMessage: vi.fn(async (text: string) => text) }));
// L'éditeur réel relaie Ctrl+Maj+Entrée par `onSubmitAlt` ; ici un bouton le fait.
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: ({ value, onChange, onSubmitAlt }: {
    value: string;
    onChange: (v: string) => void;
    onSubmitAlt?: () => void;
  }) => (
    <>
      <textarea data-testid="editor" value={value} onChange={(e) => onChange(e.target.value)} />
      {onSubmitAlt && <button type="button" onClick={onSubmitAlt}>raccourci</button>}
    </>
  ),
}));
vi.mock("@/components/personas/PersonaPickerDialog", () => ({ PersonaPickerDialog: () => null }));

import { ChatroomComposer } from "@/components/chatrooms/composer/ChatroomComposer";

const persona: Persona = { id: "p1", user_id: "u1", name: "Alpha", avatar_url: null };
const inserted = { id: 42, world_id: "w1", chat_id: "chat1", content: "Bonjour", author_id: "u1", persona_id: "p1" };

/** Le message s'insère ; toute autre requête rend une liste vide. */
function setup() {
  const mock = createSupabaseMock({ user: { id: "u1" } });
  const insertion = createSupabaseMock({ results: [{ data: inserted, error: null }] });
  const original = mock.from.getMockImplementation()!;
  mock.from.mockImplementation((table: string) =>
    table === "chat_messages" ? insertion.from(table) : original(table),
  );
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return { insertion };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChatroomComposer — envoyer et passer la main", () => {
  it("le menu d'envoi poste le message, puis passe la main", async () => {
    const { insertion } = setup();
    const onSendAndPass = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ChatroomComposer chatId="chat1" worldId="w1" presetPersona={persona} onSendAndPass={onSendAndPass} />);

    await user.type(screen.getByTestId("editor"), "Bonjour");
    await user.click(screen.getByRole("button", { name: "Plus d’options d’envoi" }));
    await user.click(await screen.findByRole("menuitem", { name: /Envoyer et passer la main/ }));

    await waitFor(() => expect(onSendAndPass).toHaveBeenCalledTimes(1));
    expect(insertion.builders[0].builder.insert).toHaveBeenCalled();
  });

  it("Ctrl+Maj+Entrée fait de même", async () => {
    setup();
    const onSendAndPass = vi.fn();
    const user = userEvent.setup();
    render(<ChatroomComposer chatId="chat1" worldId="w1" presetPersona={persona} onSendAndPass={onSendAndPass} />);

    await user.type(screen.getByTestId("editor"), "Bonjour");
    await user.click(screen.getByText("raccourci"));

    await waitFor(() => expect(onSendAndPass).toHaveBeenCalledTimes(1));
  });
});
