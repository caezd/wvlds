import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { PersonaProfileBody, PersonaProfileSheetTrigger, formatPersonaPresenceLine } from "@/components/personas/PersonaProfileSheetTrigger";
// Le message passe par next-intl (mocké sur fr.json dans vitest.setup) : on le
// lit à la source plutôt que de recopier la chaîne.
import fr from "@/messages/fr.json";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: null }),
}));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: () => "offline" }),
}));

/** navigator.clipboard n'existe pas tant qu'aucun composant n'a été rendu au
 *  moins une fois dans ce jsdom — le spy doit donc être posé après le
 *  premier render (voir MessageActionsDropdown.test.tsx pour le même
 *  constat). */
function spyOnClipboard() {
  return vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
}

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
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
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

  it("copie la couleur de dialogue dans le presse-papier au clic sur la pastille", async () => {
    setup({
      id: "p1",
      user_id: null,
      name: "Kael",
      avatar_url: null,
      banner_url: null,
      dialogue_color: "#ff00aa",
      frame: null,
    });
    const user = userEvent.setup();

    render(
      <PersonaProfileSheetTrigger personaId="p1" userId={null} label="Kael">
        <span>ouvrir</span>
      </PersonaProfileSheetTrigger>,
    );

    await user.click(screen.getByRole("button", { name: "Kael" }));
    const writeText = spyOnClipboard();

    await user.click(await screen.findByRole("button", { name: "Couleur de dialogue" }));

    expect(writeText).toHaveBeenCalledWith("#ff00aa");
    expect(toast.success).toHaveBeenCalledWith(fr.common.copyDialogueColorSuccess);
  });
});

describe("formatPersonaPresenceLine — le statut sous le nom", () => {
  const hier = new Date(Date.now() - 2 * 3_600_000).toISOString();

  it("en ligne : « En ligne » seul ; absent : « Absent »", () => {
    expect(formatPersonaPresenceLine("online", { last_seen_at: hier, appear_offline: false })).toBe("En ligne");
    expect(formatPersonaPresenceLine("away", { last_seen_at: hier, appear_offline: false })).toBe("Absent");
  });

  it("hors ligne : depuis combien de temps il a été vu", () => {
    expect(formatPersonaPresenceLine("offline", { last_seen_at: hier, appear_offline: false })).toBe("Vu il y a 2 h");
  });

  it("présence masquée, ou jamais vu : « Hors ligne » ; pas encore chargé : rien", () => {
    expect(formatPersonaPresenceLine("offline", { last_seen_at: hier, appear_offline: true })).toBe("Hors ligne");
    expect(formatPersonaPresenceLine("offline", { last_seen_at: null, appear_offline: false })).toBe("Hors ligne");
    expect(formatPersonaPresenceLine("offline", null)).toBeNull();
  });
});

describe("PersonaProfileBody — bordure de groupe", () => {
  const base = {
    name: "Oskar", avatarUrl: null, bannerUrl: null, dialogueColor: null, presenceLine: null,
    userPresence: "offline" as const, isFollowing: null, followBusy: false, onToggleFollow: () => {},
    sections: [], activeTab: null, onActiveTabChange: () => {}, loading: false,
  };

  it("sans cadre, l'avatar est bordé de la couleur de son groupe", () => {
    const { container } = render(<PersonaProfileBody {...base} frameUrl={null} groupColor="#FBBF24" />);
    const ring = container.querySelector("[data-group-ring]") as HTMLElement;
    expect(ring).toHaveAttribute("data-group-ring", "#FBBF24");
    expect(ring.style.getPropertyValue("--group-ring")).toBe("#FBBF24");
  });

  it("avec un cadre, ou sans groupe (option coupée), pas de bordure", () => {
    const { container, rerender } = render(<PersonaProfileBody {...base} frameUrl="https://x/frame.png" groupColor="#FBBF24" />);
    expect(container.querySelector("[data-group-ring]")).toBeNull();
    rerender(<PersonaProfileBody {...base} frameUrl={null} groupColor={null} />);
    expect(container.querySelector("[data-group-ring]")).toBeNull();
  });
});
