import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

function setup(results: { data: unknown; error?: unknown }[]) {
  const mock = createSupabaseMock({ results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

function mount() {
  return render(<UserProfileSheet open onOpenChange={() => {}} userId="me" initialUsername="moi" initialAvatarUrl={null} email="moi@test.local" />);
}

beforeEach(() => { vi.clearAllMocks(); route.pathname = "/explore"; });

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

  it("la carte du monde ne s'y règle plus : elle vit dans la liste des membres", async () => {
    route.pathname = `/w/${W1}`;
    setup([{ data: { bio: "", pronouns: [] } }]);
    mount();
    await screen.findByRole("heading", { name: "Mon profil" });
    await waitFor(() => expect(screen.queryByTestId("my-world-card")).toBeNull());
  });
});
