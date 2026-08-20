import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: () => "offline" }),
}));

import { UserProfileSheetTrigger } from "@/components/profile/UserProfileSheetTrigger";

const PROFILE = {
  username: "caedrik",
  avatar_url: null,
  bio: null,
  pronouns: null,
  created_at: "2026-01-01T00:00:00Z",
  last_seen_at: null,
  appear_offline: false,
};

function setup(balanceResult: { data: unknown; error?: unknown } = { data: null }) {
  const mock = createSupabaseMock({ results: [{ data: PROFILE }] });
  mock.rpc.mockResolvedValueOnce(balanceResult);
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UserProfileSheetTrigger — statistiques de progression", () => {
  it("affiche niveau, XP, pièces et streak quand le compte a un solde de gamification", async () => {
    setup({ data: [{ xp: 250, coins: 42, streak_current: 3, streak_longest: 9 }] });
    const user = userEvent.setup();
    render(<UserProfileSheetTrigger userId="u1">Voir le profil</UserProfileSheetTrigger>);

    await user.click(screen.getByRole("button", { name: "Profil joueur" }));

    expect(await screen.findByText("Niveau 3")).toBeInTheDocument();
    expect(screen.getByText("250 / 300 XP")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("3 j.")).toBeInTheDocument();
  });

  it("accepte aussi un résultat RPC non enveloppé dans un tableau", async () => {
    setup({ data: { xp: 50, coins: 5, streak_current: 1, streak_longest: 1 } });
    const user = userEvent.setup();
    render(<UserProfileSheetTrigger userId="u1">Voir le profil</UserProfileSheetTrigger>);

    await user.click(screen.getByRole("button", { name: "Profil joueur" }));

    expect(await screen.findByText("Niveau 1")).toBeInTheDocument();
  });

  it("n'affiche rien pour la progression quand le compte n'a pas encore de solde", async () => {
    setup({ data: null });
    const user = userEvent.setup();
    render(<UserProfileSheetTrigger userId="u1">Voir le profil</UserProfileSheetTrigger>);

    await user.click(screen.getByRole("button", { name: "Profil joueur" }));

    await waitFor(() => expect(screen.getAllByText("caedrik").length).toBeGreaterThan(0));
    expect(screen.queryByText(/^Niveau /)).not.toBeInTheDocument();
  });

  it("interroge le solde via la RPC get_balance_summary (RLS : pas de lecture directe pour un autre utilisateur)", async () => {
    const mock = setup({ data: [{ xp: 0, coins: 0, streak_current: 0, streak_longest: 0 }] });
    const user = userEvent.setup();
    render(<UserProfileSheetTrigger userId="u1">Voir le profil</UserProfileSheetTrigger>);

    await user.click(screen.getByRole("button", { name: "Profil joueur" }));

    await waitFor(() => {
      expect(mock.rpc).toHaveBeenCalledWith("get_balance_summary", { p_user_id: "u1" });
    });
  });
});
