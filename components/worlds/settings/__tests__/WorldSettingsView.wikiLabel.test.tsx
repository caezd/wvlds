import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { World } from "@/types/worlds";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ public_worlds: false, world_timeline: false }),
}));
vi.mock("@/components/worlds/settings/WorldPersonaTemplateSection", () => ({
  WorldPersonaTemplateSection: () => <div data-testid="persona-template-stub" />,
}));
vi.mock("@/components/worlds/settings/WorldCategoryManager", () => ({
  WorldCategoryManager: () => <div data-testid="category-manager-stub" />,
}));
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldFeature: vi.fn().mockResolvedValue({ ok: true }),
  setWorldRestriction: vi.fn().mockResolvedValue({ ok: true }),
  setWorldFaceclaims: vi.fn().mockResolvedValue({ ok: true }),
  setWorldAgeRestricted: vi.fn().mockResolvedValue({ ok: true }),
  setWorldTimeline: vi.fn().mockResolvedValue({ ok: true }),
  setWorldAvatarType: vi.fn().mockResolvedValue({ ok: true }),
  getWorldTags: vi.fn().mockResolvedValue({ ok: true, tags: [] }),
  addWorldTag: vi.fn().mockResolvedValue({ ok: true, tag: "" }),
  removeWorldTag: vi.fn().mockResolvedValue({ ok: true }),
}));

import { WorldSettingsView } from "@/components/worlds/settings/WorldSettingsView";

const BASE_WORLD: World = {
  id: "w1",
  name: "Veldis",
  description: "",
  icon_url: null,
  banner_url: null,
  color: null,
  visibility: "private",
  enable_inventory: true,
  enable_skills: true,
  enable_faceclaims: true,
  restrict_inventory: false,
  restrict_skills: false,
  timeline_enabled: false,
  timeline_config: null,
  allows_real_avatars: false,
  allows_illustrated_avatars: false,
  is_age_restricted: false,
  wiki_label: null,
};

function setup() {
  const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

describe("WorldSettingsView — libellé personnalisé du lien wiki", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche « Annexes » en placeholder quand aucun libellé n'est défini", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldSettingsView world={BASE_WORLD} onClose={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Fonctions" }));

    expect(screen.getByPlaceholderText("Annexes")).toHaveValue("");
  });

  it("préremplit le champ avec le libellé déjà enregistré", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldSettingsView world={{ ...BASE_WORLD, wiki_label: "Compendium" }} onClose={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Fonctions" }));

    expect(screen.getByPlaceholderText("Annexes")).toHaveValue("Compendium");
  });

  it("enregistre le nouveau libellé au blur", async () => {
    const mock = setup();
    const user = userEvent.setup();
    render(<WorldSettingsView world={BASE_WORLD} onClose={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Fonctions" }));
    const input = screen.getByPlaceholderText("Annexes");
    await user.type(input, "Compendium");
    await user.tab(); // blur

    await waitFor(() => {
      const builders = mock.buildersFor("worlds");
      expect(builders.at(-1)?.update).toHaveBeenCalledWith({ wiki_label: "Compendium" });
    });
  });

  it("confirme la sauvegarde par un toast", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldSettingsView world={BASE_WORLD} onClose={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Fonctions" }));
    const input = screen.getByPlaceholderText("Annexes");
    await user.type(input, "Compendium");
    await user.tab();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Modification enregistrée.");
    });
  });

  it("effacer le champ enregistre null (retour au libellé par défaut)", async () => {
    const mock = setup();
    const user = userEvent.setup();
    render(<WorldSettingsView world={{ ...BASE_WORLD, wiki_label: "Compendium" }} onClose={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Fonctions" }));
    const input = screen.getByPlaceholderText("Annexes");
    await user.clear(input);
    await user.tab();

    await waitFor(() => {
      const builders = mock.buildersFor("worlds");
      expect(builders.at(-1)?.update).toHaveBeenCalledWith({ wiki_label: null });
    });
  });
});
