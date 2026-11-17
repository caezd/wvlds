import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// La fiche de profil n'est plus dans le JavaScript de chaque page : elle se
// charge à la première ouverture du menu utilisateur. Ce test vérifie que le
// chemin reste fonctionnel : rien n'est monté d'avance, le menu la monte
// (fermée), et « Mon profil » l'ouvre.

vi.mock("@/components/sidebar/UserProfileSheet", () => ({
  UserProfileSheet: ({ open }: { open: boolean }) => (
    <div data-testid={open ? "fiche-ouverte" : "fiche-fermee"} />
  ),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ status: "online", setStatus: vi.fn() }),
}));
vi.mock("@/hooks/useInstallPrompt", () => ({
  useInstallPrompt: () => ({ canInstall: false, installed: false, promptInstall: vi.fn() }),
}));

import { UserMenuButton } from "@/components/sidebar/UserMenuButton";

describe("UserMenuButton — fiche de profil chargée à la demande", () => {
  it("ne monte la fiche qu'à l'ouverture du menu, et « Mon profil » l'ouvre", async () => {
    const user = userEvent.setup();
    render(<UserMenuButton userId="u1" username="moi" email="moi@exemple.test" />);

    expect(screen.queryByTestId("fiche-fermee")).toBeNull();
    expect(screen.queryByTestId("fiche-ouverte")).toBeNull();

    await user.click(screen.getByRole("button", { name: /moi/ }));
    expect(await screen.findByTestId("fiche-fermee")).toBeInTheDocument();

    await user.click(await screen.findByRole("menuitem", { name: "Mon profil" }));
    expect(await screen.findByTestId("fiche-ouverte")).toBeInTheDocument();
  });
});
