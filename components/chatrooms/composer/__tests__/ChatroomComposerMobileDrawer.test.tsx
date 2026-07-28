import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

const personaPickerMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/personas/PersonaPickerDialog", () => ({
  PersonaPickerDialog: (props: { variant?: "dialog" | "drawer" }) => {
    personaPickerMock(props);
    return null;
  },
}));

import { ChatroomComposer } from "@/components/chatrooms/composer/ChatroomComposer";

const persona: Persona = { id: "p1", user_id: "u1", name: "Alpha", avatar_url: null };

/** Simule un point de contact grossier (mobile/tactile) : le composer bascule
 *  sur la barre compacte + drawer bottom (cf. `isMobile` dans ChatroomComposer). */
function mockCoarsePointer(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(pointer: coarse)" ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function setup() {
  currentUserMock.plan = "free";
  const mock = createSupabaseMock({ user: { id: "u1" }, results: [] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

describe("ChatroomComposer — barre compacte + drawer sur mobile", () => {
  it("affiche une barre compacte plutôt que l'éditeur, et l'ouvre en drawer au tap", async () => {
    mockCoarsePointer(true);
    const user = userEvent.setup();
    render(<ChatroomComposer chatId="chat1" worldId="w1" presetPersona={persona} />);

    // Barre compacte visible, éditeur pas encore monté (drawer fermé).
    const trigger = await screen.findByRole("button", { name: /Écris ton message/i });
    expect(screen.queryByTestId("editor")).not.toBeInTheDocument();

    await user.click(trigger);

    expect(await screen.findByTestId("editor")).toBeInTheDocument();
    expect(personaPickerMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "drawer" }));
  });

  it("reste inline avec l'éditeur visible sur desktop (pointeur fin)", async () => {
    mockCoarsePointer(false);
    render(<ChatroomComposer chatId="chat1" worldId="w1" presetPersona={persona} />);

    expect(await screen.findByTestId("editor")).toBeInTheDocument();
    expect(personaPickerMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "dialog" }));
  });

  // Régression : en mode « création » (onResolveChat fourni, ex: dialog de
  // création de chatroom depuis un monde), le composer est déjà rendu dans un
  // Dialog — empiler notre propre Drawer par-dessus casse son containing
  // block (position: fixed) et rend l'éditeur infocusable. Sur mobile, ce
  // mode doit donc rester inline comme sur desktop, sans barre compacte.
  it("reste inline même sur mobile en mode création (onResolveChat) — évite un Drawer imbriqué dans le Dialog de création", async () => {
    mockCoarsePointer(true);
    render(
      <ChatroomComposer
        worldId="w1"
        presetPersona={persona}
        onResolveChat={async () => ({ chatId: "new-chat" })}
      />,
    );

    expect(await screen.findByTestId("editor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Écris ton message/i })).not.toBeInTheDocument();
    expect(personaPickerMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "dialog" }));
  });

  // `fillHeight` : permet à un parent qui héberge déjà le composer dans son
  // propre drawer plein écran (ex: WorldChatComposer) de demander la même
  // habillage « pleine hauteur » que le drawer interne du composer, sans
  // pour autant réactiver ce drawer interne (qui resterait désactivé par
  // useMobileDrawer=false en mode création — cf. test précédent).
  it("fillHeight étire la carte en pleine hauteur même en mode création, sans réactiver le drawer interne", async () => {
    mockCoarsePointer(true);
    const { container } = render(
      <ChatroomComposer
        worldId="w1"
        presetPersona={persona}
        onResolveChat={async () => ({ chatId: "new-chat" })}
        fillHeight
      />,
    );

    expect(await screen.findByTestId("editor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Écris ton message/i })).not.toBeInTheDocument();
    expect(container.querySelector(".group\\/composer")).toHaveClass("h-full");
  });

  it("sans fillHeight, la carte ne s'étire pas en mode création mobile (comportement desktop)", async () => {
    mockCoarsePointer(true);
    const { container } = render(
      <ChatroomComposer
        worldId="w1"
        presetPersona={persona}
        onResolveChat={async () => ({ chatId: "new-chat" })}
      />,
    );

    expect(await screen.findByTestId("editor")).toBeInTheDocument();
    expect(container.querySelector(".group\\/composer")).not.toHaveClass("h-full");
  });
});
