import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { World } from "@/types/worlds";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
// Le lecteur est le propriétaire : tous les onglets ont quelque chose à montrer.
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({
    worldId: "w1",
    ownerId: "owner",
    roles: [],
    membership: { userId: "owner", isOwner: true, roles: [], permissions: new Set(["administrator"]), rank: 2147483647 },
    can: () => true,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/components/worlds/settings/WorldRolesTab", () => ({
  WorldRolesTab: () => <div data-testid="roles-tab" />,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// `public_worlds` ouvre l'onglet Communauté.
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ public_worlds: true, world_timeline: false }),
}));
vi.mock("@/components/worlds/settings/WorldPersonaTemplateSection", () => ({
  WorldPersonaTemplateSection: () => <div data-testid="persona-template-stub" />,
}));
vi.mock("@/components/worlds/settings/WorldCategoryManager", () => ({
  WorldCategoryManager: () => <div data-testid="category-manager-stub" />,
}));
const setWorldAgeRestricted = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
const setWorldAvatarType = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldFeature: vi.fn().mockResolvedValue({ ok: true }),
  setWorldRestriction: vi.fn().mockResolvedValue({ ok: true }),
  setWorldFaceclaims: vi.fn().mockResolvedValue({ ok: true }),
  setWorldAgeRestricted,
  setWorldTimeline: vi.fn().mockResolvedValue({ ok: true }),
  setWorldAvatarType,
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

describe("WorldSettingsView — public visé, en deux cartes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function ouvrirCommunaute() {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    return { user };
  }

  it("un monde tout public : la première carte est retenue, la seconde non", async () => {
    const { user } = await ouvrirCommunaute();
    render(<WorldSettingsView world={BASE_WORLD} />);
    await user.click(screen.getByRole("button", { name: "Communauté" }));

    expect(screen.getByRole("radio", { name: /^Tout public/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /^18 ans et plus/ })).toHaveAttribute("aria-checked", "false");
  });

  it("choisir « 18 ans et plus » enregistre la restriction", async () => {
    const { user } = await ouvrirCommunaute();
    render(<WorldSettingsView world={BASE_WORLD} />);
    await user.click(screen.getByRole("button", { name: "Communauté" }));

    await user.click(screen.getByRole("radio", { name: /^18 ans et plus/ }));

    await waitFor(() => expect(setWorldAgeRestricted).toHaveBeenCalledWith("w1", true));
    await waitFor(() => expect(screen.getByRole("radio", { name: /^18 ans et plus/ })).toHaveAttribute("aria-checked", "true"));
  });

  it("revenir à « Tout public » lève la restriction", async () => {
    const { user } = await ouvrirCommunaute();
    render(<WorldSettingsView world={{ ...BASE_WORLD, is_age_restricted: true }} />);
    await user.click(screen.getByRole("button", { name: "Communauté" }));

    expect(screen.getByRole("radio", { name: /^18 ans et plus/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: /^Tout public/ }));

    await waitFor(() => expect(setWorldAgeRestricted).toHaveBeenCalledWith("w1", false));
  });
});

describe("WorldSettingsView — avatars acceptés", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
  });

  it("deux interrupteurs indépendants, l'un enregistré sans toucher l'autre", async () => {
    const user = userEvent.setup();
    render(<WorldSettingsView world={{ ...BASE_WORLD, allows_illustrated_avatars: true }} />);
    await user.click(screen.getByRole("button", { name: "Communauté" }));

    const reels = screen.getByRole("switch", { name: "Avatars réels" });
    const illustres = screen.getByRole("switch", { name: "Avatars illustrés" });
    expect(reels).toHaveAttribute("aria-checked", "false");
    expect(illustres).toHaveAttribute("aria-checked", "true");

    await user.click(reels);

    await waitFor(() => expect(setWorldAvatarType).toHaveBeenCalledWith("w1", "allows_real_avatars", true));
    await waitFor(() => expect(reels).toHaveAttribute("aria-checked", "true"));
    expect(illustres).toHaveAttribute("aria-checked", "true");
  });
});
