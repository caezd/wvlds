import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
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
vi.mock("@/components/worlds/settings/WorldHomeGridSettings", () => ({
  WorldHomeGridSettings: ({ world }: { world: World }) => (
    <div data-testid="home-grid-settings-stub">{world.id}</div>
  ),
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

describe("WorldSettingsView — onglet « Page d'accueil »", () => {
  it("affiche l'éditeur de grille quand on ouvre l'onglet", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldSettingsView world={BASE_WORLD} />);

    await user.click(screen.getByRole("tab", { name: "Page d'accueil" }));

    expect(screen.getByTestId("home-grid-settings-stub")).toHaveTextContent("w1");
  });
});
