import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: () => "offline" }),
}));
const route = vi.hoisted(() => ({ pathname: "/explore" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { UserProfileSheetTrigger } from "@/components/profile/UserProfileSheetTrigger";

const W1 = "11111111-1111-4111-8111-111111111111";
const PROFILE = { username: "mojkkin", avatar_url: null, bio: "Bio globale", pronouns: ["il"], created_at: "2026-01-01T00:00:00Z", last_seen_at: null, appear_offline: false };
const CARD = {
  user_id: "u1", status: "away", status_until: "2099-12-31", status_note: "Vacances",
  bio: "Je joue surtout **le soir**.", availability: "Le soir en semaine", timezone: "Europe/Paris", birthday_month: 10, birthday_day: 12,
};

/** Ordre des `.from()` : profiles (le profil), puis world_members et worlds (la carte, dès qu'un monde est connu). */
function setup(card: unknown) {
  const mock = createSupabaseMock({ results: [{ data: PROFILE }, { data: card }, { data: { name: "Cuntissimo" } }] });
  mock.rpc.mockResolvedValueOnce({ data: null });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => { vi.clearAllMocks(); route.pathname = "/explore"; });

describe("UserProfileSheetTrigger — sa carte dans le monde où l'on se trouve", () => {
  it("dans un monde, le profil montre statut, présentation du monde, disponibilités, heure locale et anniversaire", async () => {
    route.pathname = `/w/${W1}`;
    setup(CARD);
    const user = userEvent.setup();
    render(<UserProfileSheetTrigger userId="u1">Voir le profil</UserProfileSheetTrigger>);
    await user.click(screen.getByRole("button", { name: "Profil joueur" }));

    // Le profil global reste là…
    expect(await screen.findByText("Bio globale")).toBeInTheDocument();
    // …et la carte du monde s'y ajoute.
    const section = await screen.findByTestId("member-world-card");
    expect(within(section).getByRole("heading", { name: "Dans Cuntissimo" })).toBeInTheDocument();
    expect(within(section).getByText("le soir").tagName).toBe("STRONG");
    expect(within(section).getByText(/Le soir en semaine · .* heure locale/)).toBeInTheDocument();
    expect(within(section).getByText(/Anniversaire le/)).toBeInTheDocument();
    expect(within(section).getByText(/Absent/)).toBeInTheDocument();
  });

  it("hors d'un monde, ou pour un non-membre, pas de section", async () => {
    setup(null);
    const user = userEvent.setup();
    render(<UserProfileSheetTrigger userId="u1">Voir le profil</UserProfileSheetTrigger>);
    await user.click(screen.getByRole("button", { name: "Profil joueur" }));
    await screen.findByText("Bio globale");
    expect(screen.queryByTestId("member-world-card")).toBeNull();

    route.pathname = `/w/${W1}`;
    setup(null);
    render(<UserProfileSheetTrigger userId="u2">Voir le profil</UserProfileSheetTrigger>);
    await user.click(screen.getAllByRole("button", { name: "Profil joueur" })[1]);
    await waitFor(() => expect(screen.queryByTestId("member-world-card")).toBeNull());
  });

  it("une carte vide et un statut actif n'affichent rien", async () => {
    route.pathname = `/w/${W1}`;
    setup({ ...CARD, status: "active", bio: null, availability: null, timezone: null, birthday_month: null, birthday_day: null });
    const user = userEvent.setup();
    render(<UserProfileSheetTrigger userId="u1">Voir le profil</UserProfileSheetTrigger>);
    await user.click(screen.getByRole("button", { name: "Profil joueur" }));
    await screen.findByText("Bio globale");
    await waitFor(() => expect(screen.queryByTestId("member-world-card")).toBeNull());
  });
});
