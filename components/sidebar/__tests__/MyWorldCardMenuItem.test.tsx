import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const route = vi.hoisted(() => ({ pathname: "/explore" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ status: "online", setStatus: vi.fn(), getUserPresence: () => "online" }),
}));
vi.mock("@/hooks/useInstallPrompt", () => ({ useInstallPrompt: () => ({ canInstall: false, installed: true, promptInstall: vi.fn() }) }));
vi.mock("@/components/sidebar/UserProfileSheet", () => ({ UserProfileSheet: () => null }));
// Le dialogue lui-même est testé ailleurs : ici, qu'il s'ouvre avec la bonne carte.
vi.mock("@/components/worlds/members/WorldMemberCardDialog", () => ({
  WorldMemberCardDialog: ({ worldId, initial, mode }: { worldId: string; initial: { bio: string | null }; mode: string }) => (
    <div data-testid="card-dialog" data-world={worldId} data-mode={mode}>{initial.bio}</div>
  ),
}));

import { UserMenuButton } from "@/components/sidebar/UserMenuButton";

const W1 = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";
const CARD = { user_id: "me", status: "active", status_until: null, status_note: null, bio: "Rôliste du soir", availability: null, timezone: null, birthday_month: null, birthday_day: null };

function setup(results: { data: unknown }[]) {
  const mock = createSupabaseMock({ results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

async function openMenu() {
  const user = userEvent.setup();
  render(<UserMenuButton userId="me" username="moi" email="moi@test.local" variant="compact" />);
  await user.click(screen.getByRole("button", { name: "Menu du compte" }));
  return user;
}

beforeEach(() => { vi.clearAllMocks(); route.pathname = "/explore"; });

describe("Ma carte dans ce monde — menu du compte", () => {
  it("hors d'un monde, l'entrée n'existe pas", async () => {
    setup([]);
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: "Mon profil" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Ma carte dans ce monde" })).toBeNull();
  });

  it("sur la page d'un monde dont on est membre, l'entrée ouvre la carte de ce monde", async () => {
    route.pathname = `/w/${W1}`;
    setup([{ data: CARD }]);
    const user = await openMenu();
    const item = await screen.findByRole("menuitem", { name: "Ma carte dans ce monde" });
    await user.click(item);
    const dialog = await screen.findByTestId("card-dialog");
    expect(dialog).toHaveAttribute("data-world", W1);
    expect(dialog).toHaveAttribute("data-mode", "self");
    expect(dialog).toHaveTextContent("Rôliste du soir");
  });

  it("dans un salon, le monde vient du salon", async () => {
    route.pathname = `/c/${C1}`;
    // chatrooms (le monde du salon) puis world_members (ma carte)
    const mock = setup([{ data: { world_id: W1 } }, { data: CARD }]);
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: "Ma carte dans ce monde" })).toBeInTheDocument();
    await waitFor(() => expect(mock.client.from).toHaveBeenCalledWith("chatrooms"));
  });

  it("dans un monde dont on n'est pas membre, rien", async () => {
    route.pathname = `/w/${W1}`;
    setup([{ data: null }]);
    await openMenu();
    await screen.findByRole("menuitem", { name: "Mon profil" });
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Ma carte dans ce monde" })).toBeNull());
  });
});
