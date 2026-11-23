import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { World } from "@/types/worlds";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const flags = vi.hoisted(() => ({ public_worlds: false, world_timeline: false, world_map: true, world_live_chat: true }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({ useFeatureFlags: () => flags }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/worlds/settings/WorldRolesTab", () => ({ WorldRolesTab: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldPersonaTemplateSection", () => ({ WorldPersonaTemplateSection: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldCategoryManager", () => ({ WorldCategoryManager: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldHomeGridSettings", () => ({ WorldHomeGridSettings: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldRelationsSettings", () => ({ WorldRelationsSettings: () => <div /> }));
const setWorldFeature = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldFeature: (...args: unknown[]) => setWorldFeature(...args),
  setWorldRestriction: vi.fn().mockResolvedValue({ ok: true }),
  setWorldFaceclaims: vi.fn().mockResolvedValue({ ok: true }),
  setWorldRequireFaceclaim: vi.fn().mockResolvedValue({ ok: true }),
  setWorldTimeline: vi.fn().mockResolvedValue({ ok: true }),
}));

import { WorldSettingsView } from "@/components/worlds/settings/WorldSettingsView";

const MONDE = { id: "w1", name: "Veldis", visibility: "private" } as unknown as World;
function monter(world: Partial<World> = {}) {
  const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  render(<WorldSettingsView world={{ ...MONDE, ...world } as World} />);
}
const nav = () => screen.getByRole("navigation", { name: "Sections des paramètres" });

beforeEach(() => {
  vi.clearAllMocks();
  flags.world_live_chat = true;
});

describe("WorldSettingsView — Chatbox (migration 237)", () => {
  it("absente des Fonctions tant que le drapeau global est éteint", () => {
    flags.world_live_chat = false;
    monter();
    expect(within(nav()).queryByRole("button", { name: "Chatbox" })).toBeNull();
  });

  it("drapeau allumé : une entrée « Chatbox », éteinte par défaut pour le monde", async () => {
    monter();
    const entree = within(nav()).getByRole("button", { name: "Chatbox" });
    expect(entree).toHaveAccessibleDescription("Off");
    await userEvent.click(entree);
    const page = screen.getByRole("region", { name: "Chatbox" });
    expect(within(page).getByRole("switch", { name: "Activer la chatbox" })).toHaveAttribute("aria-checked", "false");
  });

  it("l'activer l'enregistre pour le monde, et la pastille suit", async () => {
    const onUpdated = vi.fn();
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    render(<WorldSettingsView world={MONDE} onUpdated={onUpdated} />);
    await userEvent.click(within(nav()).getByRole("button", { name: "Chatbox" }));
    await userEvent.click(screen.getByRole("switch", { name: "Activer la chatbox" }));
    expect(setWorldFeature).toHaveBeenCalledWith("w1", "enable_live_chat", true);
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ enable_live_chat: true }));
    expect(within(nav()).getByRole("button", { name: "Chatbox" })).toHaveAccessibleDescription("Actif");
  });

  it("un monde qui l'a activée la montre active", () => {
    monter({ enable_live_chat: true });
    expect(within(nav()).getByRole("button", { name: "Chatbox" })).toHaveAccessibleDescription("Actif");
  });
});
