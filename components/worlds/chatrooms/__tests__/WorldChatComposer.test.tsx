import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "u1" }),
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ world_map: false }),
}));

// Le composer réel est déjà couvert par ses propres tests (mode création,
// isMobile) — ici on ne teste que le choix Dialog/Drawer de son conteneur.
vi.mock("@/components/chatrooms/composer/ChatroomComposer", () => ({
  ChatroomComposer: () => <div data-testid="composer-stub" />,
}));

/** Simule un point de contact grossier (mobile/tactile). */
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
  const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: [], error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

import { WorldChatComposer } from "@/components/worlds/chatrooms/WorldChatComposer";

describe("WorldChatComposer — Dialog (desktop) vs Drawer (mobile)", () => {
  it("ouvre un Dialog (Radix) centré sur desktop", async () => {
    mockCoarsePointer(false);
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" />);

    await user.click(screen.getByText(/Nouveau jeu/i));

    expect(await screen.findByTestId("composer-stub")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="drawer-popup"]')).not.toBeInTheDocument();
  });

  it("ouvre un Drawer (Base UI) sur mobile — un seul système de modal actif, pas de Dialog imbriqué", async () => {
    mockCoarsePointer(true);
    const user = userEvent.setup();
    render(<WorldChatComposer worldId="w1" />);

    await user.click(screen.getByText(/Nouveau jeu/i));

    expect(await screen.findByTestId("composer-stub")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
  });
});
