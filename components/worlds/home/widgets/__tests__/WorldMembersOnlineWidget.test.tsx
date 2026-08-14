import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

// Le mock global next-intl (vitest.setup.ts) n'interprète pas les pluriels
// ICU imbriqués — on fournit ici une résolution simplifiée pour cette clé,
// comme le fait déjà WorldCategoryFolders.test.tsx pour "sidebar.subjects".
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, opts?: Record<string, unknown>) => {
    if (key === "home.onlineCount") {
      const count = Number(opts?.count ?? 0);
      return count === 1 ? "1 membre en ligne" : `${count} membres en ligne`;
    }
    if (key === "home.noneOnline") return "Personne en ligne pour le moment";
    return key;
  },
}));

const mockOnlineUsers = vi.fn<() => Record<string, unknown>>(() => ({}));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ onlineUsers: mockOnlineUsers() }),
}));

import { WorldMembersOnlineWidget } from "@/components/worlds/home/widgets/WorldMembersOnlineWidget";

function setup() {
  const mock = createSupabaseMock({
    results: [
      { data: [{ user_id: "u1" }, { user_id: "u2" }] },
      {
        data: [
          { id: "u1", username: "alice", avatar_url: null },
          { id: "u2", username: "bob", avatar_url: null },
        ],
      },
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOnlineUsers.mockReturnValue({});
});

describe("WorldMembersOnlineWidget", () => {
  it("n'affiche personne quand aucun membre n'est en ligne", async () => {
    setup();
    render(<WorldMembersOnlineWidget worldId="w1" />);

    await waitFor(() => {
      expect(screen.getByText("Personne en ligne pour le moment")).toBeInTheDocument();
    });
  });

  it("compte et liste uniquement les membres en ligne", async () => {
    mockOnlineUsers.mockReturnValue({ u1: { user_id: "u1" } });
    setup();
    render(<WorldMembersOnlineWidget worldId="w1" />);

    await waitFor(() => {
      expect(screen.getByText("1 membre en ligne")).toBeInTheDocument();
    });
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();
  });

  it("pointe vers l'onglet Membres du monde", async () => {
    setup();
    render(<WorldMembersOnlineWidget worldId="w1" />);

    await waitFor(() => {
      expect(screen.getByRole("link")).toHaveAttribute("href", "/w/w1?view=members");
    });
  });
});
