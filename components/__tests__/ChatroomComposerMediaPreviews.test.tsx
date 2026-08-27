import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";

const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
});

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "u1", username: "tester" }),
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ chatroom_media: true, chatroom_blocks: false, block_npc: false, block_hp: false }),
}));
vi.mock("@/lib/crypto", () => ({ encryptMessage: vi.fn(async (t: string) => t) }));
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="composer-input" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { ChatroomComposer } from "@/components/chatrooms/composer/ChatroomComposer";

const mockPersona: Persona = {
  id: "p1", user_id: "u1", name: "Alia", avatar_url: null,
} as unknown as Persona;

// ── Compteur d'URL blob ──────────────────────────────────────────────────────
let created = 0;
let revoked = 0;
let seq = 0;

beforeEach(() => {
  created = 0; revoked = 0; seq = 0;
  vi.mocked(createClient).mockReturnValue(createSupabaseMock({ user: { id: "u1" } }).client as never);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => { created++; return `blob:mock-${++seq}`; },
    revokeObjectURL: () => { revoked++; },
  });
});
afterEach(() => vi.unstubAllGlobals());

function file(name: string) {
  return new File(["x"], name, { type: "image/png" });
}

/** Colle des images dans le composer — seule voie d'ajout de médias. */
function pasteImages(container: HTMLElement, files: File[]) {
  const target = container.querySelector("[data-testid=\"composer-input\"]")!.closest("div")!;
  fireEvent.paste(target, {
    clipboardData: {
      items: files.map((f) => ({ type: f.type, getAsFile: () => f })),
    },
  });
}

/**
 * `URL.createObjectURL` était appelé directement dans le corps du rendu. Comme
 * ce composant porte l'état de la zone de saisie, il se re-rend à chaque frappe :
 * écrire un message avec des images attachées fabriquait autant d'URL `blob:`
 * par caractère tapé, aucune n'étant jamais révoquée — chacune retenant son
 * fichier en mémoire jusqu'au rechargement de la page.
 */
describe("ChatroomComposer — aperçus d'images", () => {
  it("ne recrée pas d'URL blob à chaque frappe", async () => {
    const { container } = render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} />);

    await act(async () => { pasteImages(container, [file("a.png"), file("b.png")]); });
    const afterAttach = created;
    expect(afterAttach).toBeGreaterThan(0);

    // Simule la frappe. `fireEvent.change` passe par le traqueur de valeur de
    // React — un `dispatchEvent("input")` brut serait ignoré sur un champ
    // contrôlé, et le test passerait alors même sans correctif.
    const input = screen.getByTestId("composer-input");
    for (const text of ["b", "bo", "bon", "bonj", "bonjo"]) {
      await act(async () => { fireEvent.change(input, { target: { value: text } }); });
    }
    expect((input as HTMLTextAreaElement).value, "la frappe doit bien re-rendre").toBe("bonjo");

    expect(created, "aucune URL supplémentaire ne doit être créée en tapant").toBe(afterAttach);
  });

  it("libère les URL au démontage", async () => {
    const { container, unmount } = render(<ChatroomComposer chatId="chat1" presetPersona={mockPersona} />);

    await act(async () => { pasteImages(container, [file("a.png")]); });
    expect(created).toBeGreaterThan(0);

    unmount();
    expect(revoked, "toute URL créée doit être révoquée").toBeGreaterThanOrEqual(created);
  });
});
