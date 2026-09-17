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

  it("ne requête les profils que pour les membres en ligne, pas pour tout le monde", async () => {
    // 3 membres dans le monde, mais un seul en ligne (présence globale) —
    // la requête `profiles` ne doit porter que sur celui-ci, pas les 3.
    mockOnlineUsers.mockReturnValue({ u1: { user_id: "u1" } });
    const mock = createSupabaseMock({
      results: [
        { data: [{ user_id: "u1" }, { user_id: "u2" }, { user_id: "u3" }] },
        { data: [{ id: "u1", username: "alice", avatar_url: null }] },
      ],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    render(<WorldMembersOnlineWidget worldId="w1" />);

    await waitFor(() => {
      expect(screen.getByText("A")).toBeInTheDocument();
    });
    const profilesBuilder = mock.builders.find((b) => b.table === "profiles")!.builder;
    expect(profilesBuilder.in).toHaveBeenCalledWith("id", ["u1"]);
  });

  it("en style « liste », affiche un membre par ligne avec son nom", async () => {
    mockOnlineUsers.mockReturnValue({ u1: { user_id: "u1" }, u2: { user_id: "u2" } });
    setup();
    render(<WorldMembersOnlineWidget worldId="w1" style="list" />);

    await waitFor(() => {
      expect(screen.getByText("2 membres en ligne")).toBeInTheDocument();
    });
    // Version étroite : un membre par ligne, avec son avatar.
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["A@alice", "B@bob"]);
    // Version large : les noms à la suite, séparés par des virgules.
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "@alice, @bob")).toBeInTheDocument();
    // Le lien vers l'onglet Membres est un petit bouton en bout de ligne,
    // pas le compteur lui-même.
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/w/w1?view=members");
    expect(link).not.toHaveTextContent("2 membres en ligne");
  });

  it("en style « liste », le surplus au-delà de la limite est compté", async () => {
    mockOnlineUsers.mockReturnValue({ u1: { user_id: "u1" }, u2: { user_id: "u2" } });
    setup();
    render(<WorldMembersOnlineWidget worldId="w1" style="list" limit={1} />);

    await waitFor(() => {
      expect(screen.getAllByText("@alice").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("@bob")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((r) => r.textContent)).toEqual(["A@alice", "+1"]);
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "@alice +1")).toBeInTheDocument();
  });

  it("avec une limite à 0, n'affiche que le compteur, dans les deux styles", async () => {
    mockOnlineUsers.mockReturnValue({ u1: { user_id: "u1" }, u2: { user_id: "u2" } });
    setup();
    const { unmount } = render(<WorldMembersOnlineWidget worldId="w1" limit={0} />);
    await waitFor(() => {
      expect(screen.getByText("2 membres en ligne")).toBeInTheDocument();
    });
    expect(screen.queryByText("A")).not.toBeInTheDocument();
    expect(screen.queryByText("+2")).not.toBeInTheDocument();
    unmount();

    setup();
    render(<WorldMembersOnlineWidget worldId="w1" limit={0} style="list" />);
    await waitFor(() => {
      expect(screen.getByText("2 membres en ligne")).toBeInTheDocument();
    });
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByText("@alice")).not.toBeInTheDocument();
  });

  it("ne requête pas les profils quand personne n'est en ligne", async () => {
    const mock = setup();
    render(<WorldMembersOnlineWidget worldId="w1" />);

    await waitFor(() => {
      expect(screen.getByText("Personne en ligne pour le moment")).toBeInTheDocument();
    });
    expect(mock.builders.some((b) => b.table === "profiles")).toBe(false);
  });
});
