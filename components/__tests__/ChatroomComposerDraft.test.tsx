import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";
import type { ChatroomComposerHandle } from "@/components/chatrooms/composer/ChatroomComposer";

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
vi.mock("@/lib/crypto", () => ({
  encryptMessage: vi.fn(async (text: string) => text),
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

const mockPersona: Persona = {
  id: "p1",
  user_id: "u1",
  name: "Aria",
  avatar_url: null,
};

function setupSuccessMock() {
  const mock = createSupabaseMock({
    user: { id: "u1" },
    results: [
      { data: { id: "m1", world_id: null }, error: null }, // insert message
      { data: null, error: null }, // upsert persona pref
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(_store)) delete _store[k];
  setupSuccessMock();
});

afterEach(() => {
  vi.useRealTimers();
  for (const k of Object.keys(_store)) delete _store[k];
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ChatroomComposer — brouillons localStorage", () => {
  describe("lecture au montage", () => {
    it("charge le brouillon existant dans l'éditeur", () => {
      localStorage.setItem("draft:chat1", "Mon brouillon");
      render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} />);
      expect(screen.getByTestId("editor")).toHaveValue("Mon brouillon");
    });

    it("laisse l'éditeur vide si aucun brouillon n'est sauvegardé", () => {
      render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} />);
      expect(screen.getByTestId("editor")).toHaveValue("");
    });

    it("utilise la clé 'draft:new' quand chatId est absent (mode création)", () => {
      localStorage.setItem("draft:new", "Brouillon création");
      render(
        <ChatroomComposer
          presetPersona={mockPersona}
          onResolveChat={async () => ({ chatId: "chat-new" })}
        />,
      );
      expect(screen.getByTestId("editor")).toHaveValue("Brouillon création");
    });
  });

  describe("sauvegarde debounced", () => {
    // Note : vi.useFakeTimers() gèle les timers internes de Radix UI (DropdownMenu)
    // et bloque userEvent. On teste le debounce avec de vrais timers :
    // - vérification immédiate après la frappe (délai non encore expiré)
    // - waitFor qui attend que le délai expire naturellement.

    it("sauvegarde le brouillon dans localStorage après le délai de debounce", async () => {
      const user = userEvent.setup({ delay: null });
      render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} />);
      await user.type(screen.getByTestId("editor"), "Bonjour monde");

      expect(localStorage.getItem("draft:chat1")).toBeNull();

      // Plafond large à dessein : `waitFor` rend la main dès que la
      // condition tient, donc un plafond haut ne coûte rien sur un
      // lancement sain. À 1500 ms pour un debounce de 500 ms, il ne
      // restait aucune marge sous la contention CPU de la suite
      // complète — c'est ce plafond local, et non le timeout global,
      // qui faisait échouer ce test une fois sur quatre.
      await waitFor(
        () => expect(localStorage.getItem("draft:chat1")).toBe("Bonjour monde"),
        { timeout: 10_000 },
      );
    });

    it("n'écrit pas encore dans localStorage juste après la frappe", async () => {
      const user = userEvent.setup({ delay: null });
      render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} />);
      await user.type(screen.getByTestId("editor"), "En cours de frappe");
      // user.type() résout tous les effets React synchrones ; le setTimeout
      // de 500 ms n'a pas encore expiré.
      expect(localStorage.getItem("draft:chat1")).toBeNull();
    });
  });

  describe("suppression après envoi", () => {
    it("supprime le brouillon du localStorage après un envoi réussi", async () => {
      const user = userEvent.setup({ delay: null });
      localStorage.setItem("draft:chat1", "Message prêt à envoyer");

      render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} />);

      expect(screen.getByTestId("editor")).toHaveValue("Message prêt à envoyer");

      await user.click(screen.getByTitle("Envoyer"));

      await waitFor(() =>
        expect(localStorage.getItem("draft:chat1")).toBeNull(),
      );
    });

    it("vide l'éditeur après un envoi réussi", async () => {
      const user = userEvent.setup({ delay: null });
      localStorage.setItem("draft:chat1", "Message prêt à envoyer");

      render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} />);
      await user.click(screen.getByTitle("Envoyer"));

      await waitFor(() =>
        expect(screen.getByTestId("editor")).toHaveValue(""),
      );
    });

    it("clearDraft() annule immédiatement le timer de debounce en cours", async () => {
      const user = userEvent.setup({ delay: null });
      const ref = createRef<ChatroomComposerHandle>();
      render(<ChatroomComposer ref={ref} chatId="chat1" presetPersona={mockPersona} />);

      // Frappe : programme le debounce (500 ms) mais ne le laisse pas expirer.
      await user.type(screen.getByTestId("editor"), "Brouillon abandonné");

      // clearDraft() doit annuler ce timer synchronement, sans dépendre du
      // prochain rendu React déclenché par setValue("") : si on ne compte que
      // sur ce rendu, le timer déjà armé peut encore écrire l'ancien
      // brouillon dans la fenêtre avant que l'effet ne se ré-exécute.
      const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
      act(() => {
        ref.current?.clearDraft();
      });
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();

      // Le brouillon ne doit pas réapparaître une fois le délai écoulé.
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(localStorage.getItem("draft:chat1")).toBeNull();
    });

    it("conserve le brouillon si l'envoi échoue", async () => {
      const mock = createSupabaseMock({
        user: { id: "u1" },
        results: [{ data: null, error: { message: "Network error" } }],
      });
      vi.mocked(createClient).mockReturnValue(mock.client as never);

      const user = userEvent.setup({ delay: null });
      localStorage.setItem("draft:chat1", "Message important");

      render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} />);
      await user.click(screen.getByTitle("Envoyer"));

      await waitFor(() =>
        expect(localStorage.getItem("draft:chat1")).toBe("Message important"),
      );
    });
  });
});
