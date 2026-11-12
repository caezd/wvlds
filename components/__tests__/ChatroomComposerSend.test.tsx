import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";

// ── localStorage en mémoire ───────────────────────────────────────────────────
// jsdom fournit un localStorage partiel (pas de .clear()) — on le remplace par
// une implémentation complète basée sur un objet JS.
const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "u1", username: "tester" }),
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({
    chatroom_media: false,
    chatroom_blocks: false,
    block_npc: false,
    block_hp: false,
  }),
}));
// Contenu « chiffré » reconnaissable : la vue doit recevoir le texte EN CLAIR.
vi.mock("@/lib/crypto", () => ({
  encryptMessage: vi.fn(async (text: string) => `enc:${text}`),
  decryptMessage: vi.fn(async (text: string) => text),
}));

// ParagraphBlockEditor remplacé par un <textarea> contrôlé pour éviter les
// manipulations DOM contenteditable qui ne fonctionnent pas dans jsdom.
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: ({
    value,
    onChange,
    onKeyDown,
  }: {
    value: string;
    onChange: (v: string) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  }) => (
    <textarea
      data-testid="editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  ),
}));
vi.mock("@/components/personas/PersonaPickerDialog", () => ({
  PersonaPickerDialog: () => null,
}));

import { ChatroomComposer } from "@/components/chatrooms/composer/ChatroomComposer";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockPersona: Persona = { id: "p1", user_id: "u1", name: "Aria", avatar_url: null };

const ligneInseree = {
  id: 42,
  world_id: "w1",
  chat_id: "chat1",
  content: "enc:Bonjour",
  author_id: "u1",
  created_at: "2026-11-11T10:00:00Z",
  metadata: null,
  visible_to: null,
  persona: { id: "p1", user_id: "u1", name: "Aria", avatar_url: null },
  author: { avatar_url: null, username: "tester" },
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(_store)) delete _store[k];
});

describe("ChatroomComposer — envoi", () => {
  it("transmet la ligne complète, contenu en clair, dès l'insertion", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: ligneInseree }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const onMessageCreated = vi.fn();
    const user = userEvent.setup({ delay: null });
    localStorage.setItem("draft:chat1", "Bonjour");

    render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} onMessageCreated={onMessageCreated} />);
    await user.click(screen.getByTitle("Envoyer"));

    await waitFor(() => expect(onMessageCreated).toHaveBeenCalledTimes(1));
    expect(onMessageCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42, content: "Bonjour", persona: expect.objectContaining({ name: "Aria" }) }),
    );
    // Les colonnes de la vue reviennent avec l'insertion.
    const insertion = mock.buildersFor("chat_messages")[0];
    expect(insertion.select.mock.calls[0][0]).toContain("persona:personas(");
  });

  it("libère le composeur sans attendre les effets annexes (points, préférence)", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: ligneInseree }] });
    // L'attribution de points ne répond jamais : le champ doit se vider quand même.
    mock.rpc.mockReturnValue(new Promise(() => {}));
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup({ delay: null });
    localStorage.setItem("draft:chat1", "Bonjour");

    render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} />);
    await user.click(screen.getByTitle("Envoyer"));

    await waitFor(() => expect(screen.getByTestId("editor")).toHaveValue(""));
    // Les effets annexes sont bien partis, en parallèle.
    expect(mock.rpc).toHaveBeenCalledWith("award_event", expect.objectContaining({ p_ref: 42 }));
    expect(mock.from).toHaveBeenCalledWith("chatroom_persona_prefs");
  });

  it("n'appelle rien et garde le texte si l'insertion échoue", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: null, error: { message: "refus" } }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const onMessageCreated = vi.fn();
    const user = userEvent.setup({ delay: null });
    localStorage.setItem("draft:chat1", "Bonjour");

    render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} onMessageCreated={onMessageCreated} />);
    await user.click(screen.getByTitle("Envoyer"));

    await waitFor(() => expect(mock.from).toHaveBeenCalledWith("chat_messages"));
    expect(onMessageCreated).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(screen.getByTestId("editor")).toHaveValue("Bonjour");
  });

  it("envoie le lien de réponse, puis abandonne la réponse", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: ligneInseree }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const onCancelReply = vi.fn();
    const user = userEvent.setup({ delay: null });
    localStorage.setItem("draft:chat1", "Bonjour");

    render(
      <ChatroomComposer
        chatId="chat1"
        presetPersona={mockPersona}
        replyTo={{ id: 7, author: "Bran", excerpt: "Qui va là ?" }}
        onCancelReply={onCancelReply}
      />,
    );
    expect(screen.getByTestId("composer-reply")).toHaveTextContent("Qui va là ?");
    await user.click(screen.getByTitle("Envoyer"));

    await waitFor(() => expect(onCancelReply).toHaveBeenCalledTimes(1));
    const insertion = mock.buildersFor("chat_messages")[0];
    expect(insertion.insert).toHaveBeenCalledWith(expect.objectContaining({ reply_to_id: 7 }));
  });
});

describe("ChatroomComposer — languette du haut", () => {
  it("affiche la languette fournie (ex. ordre de passage) au-dessus de la carte", () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} topTab={<div data-testid="languette">À toi</div>} />);
    expect(screen.getByTestId("languette")).toBeInTheDocument();
  });
});
