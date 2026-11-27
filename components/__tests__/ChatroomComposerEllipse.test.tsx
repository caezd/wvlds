import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: "u1", username: "tester" }) }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ chatroom_media: false, chatroom_blocks: false, block_npc: false, block_hp: false }),
}));
vi.mock("@/lib/crypto", () => ({
  encryptMessage: vi.fn(async (text: string) => `enc:${text}`),
  decryptMessage: vi.fn(async (text: string) => text),
}));
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/personas/PersonaPickerDialog", () => ({ PersonaPickerDialog: () => null }));

import { ChatroomComposer } from "@/components/chatrooms/composer/ChatroomComposer";

const persona: Persona = { id: "p1", user_id: "u1", name: "Aria", avatar_url: null };

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(_store)) delete _store[k];
});

describe("ChatroomComposer — Ellipse (migration 275)", () => {
  it("fait poser l'ellipse par la base, puis publie le message qui la désigne", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: { id: 7, chat_id: "chat1", content: "enc:x" } }] });
    mock.rpc.mockImplementation(async (fn: string) =>
      fn === "post_chatroom_ellipse" ? { data: { id: "e1", days: 2 }, error: null } : { data: null, error: null },
    );
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup({ delay: null });

    render(<ChatroomComposer chatId="chat1" presetPersona={persona} />);
    await user.click(screen.getAllByRole("button", { name: "Insérer un bloc" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Ellipse/ }));
    const fenetre = await screen.findByRole("dialog", { name: "Ellipse" });
    await user.click(within(fenetre).getByRole("radio", { name: "Pluie" }));
    const jours = within(fenetre).getByRole("spinbutton", { name: "Jours passés" });
    await user.clear(jours);
    await user.type(jours, "2");
    await user.click(within(fenetre).getByRole("button", { name: "Poster l’ellipse" }));

    await waitFor(() => expect(mock.buildersFor("chat_messages")).toHaveLength(1));
    expect(mock.rpc).toHaveBeenCalledWith("post_chatroom_ellipse", { p_chat: "chat1", p_days: 2, p_icon: "cloud-rain", p_position: 10 });
    expect(mock.buildersFor("chat_messages")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: "chat1", ellipse_id: "e1", content: '{"_type":"ellipse"}' }),
    );
  });

  it("un refus de la base ne publie rien", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [] });
    mock.rpc.mockResolvedValue({ data: null, error: { message: "not_allowed" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup({ delay: null });

    render(<ChatroomComposer chatId="chat1" presetPersona={persona} />);
    await user.click(screen.getAllByRole("button", { name: "Insérer un bloc" })[0]);
    await user.click(await screen.findByRole("button", { name: /^Ellipse/ }));
    await user.click(within(await screen.findByRole("dialog", { name: "Ellipse" })).getByRole("button", { name: "Poster l’ellipse" }));

    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("post_chatroom_ellipse", expect.anything()));
    expect(mock.buildersFor("chat_messages")).toHaveLength(0);
  });
});
