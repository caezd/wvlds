import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const updateProfileBioAndPronouns = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }));
vi.mock("@/app/(protected)/settings/actions", () => ({ updateProfileBioAndPronouns }));
const route = vi.hoisted(() => ({ pathname: "/explore" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { UserProfileSheet } from "@/components/sidebar/UserProfileSheet";

const W1 = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";
const CARD = { user_id: "me", status: "active", status_until: null, status_note: null, bio: "Rôliste du soir", availability: null, timezone: null, birthday_month: null, birthday_day: null };

function setup(results: { data: unknown; error?: unknown }[]) {
  const mock = createSupabaseMock({ results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

function mount() {
  return render(<UserProfileSheet open onOpenChange={() => {}} userId="me" initialUsername="moi" initialAvatarUrl={null} email="moi@test.local" />);
}

beforeEach(() => { vi.clearAllMocks(); route.pathname = "/explore"; });

describe("Mon profil — ma carte dans ce monde", () => {
  it("hors d'un monde, pas de section", async () => {
    setup([]);
    mount();
    expect(await screen.findByRole("heading", { name: "Mon profil" })).toBeInTheDocument();
    expect(screen.queryByTestId("my-world-card")).toBeNull();
  });

  it("sur la page d'un monde dont on est membre, la carte se règle dans le profil", async () => {
    route.pathname = `/w/${W1}`;
    // world_members (ma carte), profiles (bio et pronoms), puis l'enregistrement
    const mock = setup([{ data: CARD }, { data: { bio: "", pronouns: [] } }, { data: null, error: null }]);
    const user = userEvent.setup();
    mount();
    const section = await screen.findByTestId("my-world-card");
    expect(within(section).getByRole("heading", { name: "Ma carte dans ce monde" })).toBeInTheDocument();
    const bio = within(section).getByLabelText("Présentation");
    expect(bio).toHaveValue("Rôliste du soir");

    await user.clear(bio);
    await user.type(bio, "Rôliste du matin");
    await user.click(within(section).getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      const builder = mock.buildersFor("world_members").at(-1)!;
      expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ bio: "Rôliste du matin", status: "active" }));
      expect(builder.eq).toHaveBeenCalledWith("world_id", W1);
      expect(builder.eq).toHaveBeenCalledWith("user_id", "me");
    });
  });

  it("dans un salon, le monde vient du salon", async () => {
    route.pathname = `/c/${C1}`;
    // chatrooms (le monde du salon), profiles (bio et pronoms, l'attente du
    // salon passe la carte après), puis world_members (ma carte)
    const mock = setup([{ data: { world_id: W1 } }, { data: { bio: "", pronouns: [] } }, { data: CARD }]);
    mount();
    await screen.findByTestId("my-world-card");
    await waitFor(() => expect(mock.client.from).toHaveBeenCalledWith("chatrooms"));
  });

  it("dans un monde dont on n'est pas membre, pas de section", async () => {
    route.pathname = `/w/${W1}`;
    setup([{ data: null }]);
    mount();
    await screen.findByRole("heading", { name: "Mon profil" });
    await waitFor(() => expect(screen.queryByTestId("my-world-card")).toBeNull());
  });
});

describe("Mon profil — présentation et pronoms", () => {
  it("charge la bio et les pronoms du compte, et les enregistre depuis la fiche", async () => {
    setup([{ data: { bio: "Salut !", pronouns: ["he_him"] } }]);
    const user = userEvent.setup();
    mount();
    const bio = await screen.findByLabelText("Bio");
    expect(bio).toHaveValue("Salut !");
    expect(screen.getByRole("button", { name: "Il/Lui" })).toHaveClass("text-primary");

    await user.type(bio, " Ravi d'être là.");
    await user.click(screen.getByRole("button", { name: "Enregistrer le profil" }));
    await waitFor(() => expect(updateProfileBioAndPronouns).toHaveBeenCalledWith("Salut ! Ravi d'être là.", ["he_him"]));
  });
});
