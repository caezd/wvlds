import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { PersonaProfileSheetTrigger } from "@/components/personas/PersonaProfileSheetTrigger";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: null }),
}));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: () => "offline" }),
}));

function setup(personaRow: Record<string, unknown>) {
  // Ordre des requêtes dans prefetch() avec userId=null : personas, puis
  // persona_sections (les requêtes follow/profiles/owner-presence sont
  // sautées sans userId — voir PersonaProfileSheetTrigger.tsx).
  const mock = createSupabaseMock({
    results: [
      { data: personaRow, error: null },
      { data: [], error: null }, // persona_sections
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

describe("PersonaProfileSheetTrigger", () => {
  it("transmet le cadre d'avatar chargé à AvatarWithFrame", async () => {
    setup({
      id: "p1",
      user_id: null,
      name: "Kael",
      avatar_url: null,
      banner_url: null,
      dialogue_color: null,
      frame: { asset_url: "https://x/frame.png" },
    });

    render(
      <PersonaProfileSheetTrigger personaId="p1" userId={null} label="Kael">
        <span>ouvrir</span>
      </PersonaProfileSheetTrigger>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Kael" }));
    await screen.findByText("Kael", { selector: "p" });

    // Le Drawer est porté dans document.body (portail) — pas dans `container`.
    expect(document.querySelector('img[src="https://x/frame.png"]')).toBeInTheDocument();
  });

  it("n'affiche pas de pastille de couleur de dialogue quand elle n'est pas définie", async () => {
    setup({
      id: "p1",
      user_id: null,
      name: "Kael",
      avatar_url: null,
      banner_url: null,
      dialogue_color: null,
      frame: null,
    });

    render(
      <PersonaProfileSheetTrigger personaId="p1" userId={null} label="Kael">
        <span>ouvrir</span>
      </PersonaProfileSheetTrigger>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Kael" }));
    await screen.findByText("Kael", { selector: "p" });

    expect(screen.queryByText("Couleur de dialogue")).not.toBeInTheDocument();
  });

  it("affiche une pastille avec la couleur de dialogue quand elle est définie", async () => {
    setup({
      id: "p1",
      user_id: null,
      name: "Kael",
      avatar_url: null,
      banner_url: null,
      dialogue_color: "#ff00aa",
      frame: null,
    });

    render(
      <PersonaProfileSheetTrigger personaId="p1" userId={null} label="Kael">
        <span>ouvrir</span>
      </PersonaProfileSheetTrigger>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Kael" }));
    // "Couleur de dialogue" est le texte de l'élément englobant (le point
    // coloré, lui, n'a pas de texte) — la pastille est son premier enfant.
    const wrapper = await screen.findByText("Couleur de dialogue");
    const swatch = wrapper.firstElementChild as HTMLElement;
    expect(swatch.style.backgroundColor).toBe("rgb(255, 0, 170)");
  });
});
