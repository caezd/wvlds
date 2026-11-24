import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ public_worlds: false, world_timeline: false, world_map: true, world_economy: true }),
}));
vi.mock("@/components/worlds/settings/WorldPersonaTemplateSection", () => ({
  WorldPersonaTemplateSection: () => <div />,
}));
vi.mock("@/components/worlds/settings/WorldCategoryManager", () => ({
  WorldCategoryManager: () => <div />,
}));
vi.mock("@/components/worlds/settings/WorldHomeGridSettings", () => ({
  WorldHomeGridSettings: () => <div />,
}));
vi.mock("@/components/worlds/settings/WorldRelationsSettings", () => ({
  WorldRelationsSettings: () => <div />,
}));
vi.mock("@/components/worlds/settings/WorldCurrencySettings", () => ({
  WorldCurrencySettings: () => <div />,
}));
vi.mock("@/components/worlds/shops/ShopManager", () => ({
  ShopManager: ({ worldId }: { worldId: string }) => <p>gestion des boutiques de {worldId}</p>,
}));

const setWorldFeature = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldFeature: (...args: unknown[]) => setWorldFeature(...args),
  setWorldRestriction: vi.fn().mockResolvedValue({ ok: true }),
  setWorldFaceclaims: vi.fn().mockResolvedValue({ ok: true }),
  setWorldAgeRestricted: vi.fn().mockResolvedValue({ ok: true }),
  setWorldTimeline: vi.fn().mockResolvedValue({ ok: true }),
}));

import { WorldSettingsView } from "@/components/worlds/settings/WorldSettingsView";

const MONDE = {
  id: "w1",
  name: "Ténèbres",
  visibility: "private",
} as unknown as World;

function monter(world: Partial<World> = {}) {
  const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  render(<WorldSettingsView world={{ ...MONDE, ...world } as World} />);
}

beforeEach(() => vi.clearAllMocks());

// ──────────────────────────────────────────────────────────────────────────
// Fonctions › Économie : devises, objets et boutiques, chacun sa page.
// ──────────────────────────────────────────────────────────────────────────

const ouvrir = (nom: string) => userEvent.click(screen.getByRole("button", { name: nom }));

describe("WorldSettingsView — sous-catégorie Économie", () => {
  it("rangée sous Fonctions, après les autres pages", () => {
    monter();
    const nav = screen.getByRole("navigation", { name: "Sections des paramètres" });
    const fonctions = within(nav).getByRole("group", { name: "Fonctions" });
    expect(within(fonctions).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(
      ["Carte", "Wiki", "Personas", "Devises", "Objets", "Boutiques", "Échanges"],
    );
    const economie = within(fonctions).getByRole("list", { name: "Économie" });
    expect(within(economie).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(
      ["Devises", "Objets", "Boutiques", "Échanges"],
    );
  });

  it("Devises porte l'interrupteur de l'économie", async () => {
    monter({ enable_economy: false } as Partial<World>);
    await ouvrir("Devises");
    await userEvent.click(within(screen.getByRole("region", { name: "Devises" })).getByRole("switch", { name: "Activer l'économie" }));
    await waitFor(() => expect(setWorldFeature).toHaveBeenCalledWith("w1", "enable_economy", true));
  });

  it("Objets porte l'interrupteur de l'inventaire", async () => {
    monter({ enable_inventory: true } as Partial<World>);
    await ouvrir("Objets");
    await userEvent.click(within(screen.getByRole("region", { name: "Objets" })).getByRole("switch", { name: "Activer les objets" }));
    await waitFor(() => expect(setWorldFeature).toHaveBeenCalledWith("w1", "enable_inventory", false));
  });

  it("Boutiques : inerte sans l'économie, s'active avec", async () => {
    monter({ enable_economy: false, enable_inventory: true, enable_shops: false } as Partial<World>);
    await ouvrir("Boutiques");
    const page = screen.getByRole("region", { name: "Boutiques" });
    expect(within(page).getByRole("switch", { name: "Activer les boutiques" })).toBeDisabled();
    expect(within(page).getByText("Les boutiques demandent les devises et les objets.")).toBeInTheDocument();
    expect(within(page).queryByText(/gestion des boutiques/)).toBeNull();
  });

  it("Boutiques : l'interrupteur appelle l'action avec le bon champ", async () => {
    monter({ enable_economy: true, enable_inventory: true, enable_shops: false } as Partial<World>);
    await ouvrir("Boutiques");
    const page = screen.getByRole("region", { name: "Boutiques" });
    await userEvent.click(within(page).getByRole("switch", { name: "Activer les boutiques" }));
    await waitFor(() => expect(setWorldFeature).toHaveBeenCalledWith("w1", "enable_shops", true));
    // Ouvertes, les boutiques se gèrent sur la page même.
    expect(await within(page).findByText("gestion des boutiques de w1")).toBeInTheDocument();
  });

  it("Échanges : inerte sans devises ni objets", async () => {
    monter({ enable_economy: false, enable_inventory: false, enable_trades: false } as Partial<World>);
    await ouvrir("Échanges");
    const page = screen.getByRole("region", { name: "Échanges" });
    expect(within(page).getByRole("switch", { name: "Activer les échanges" })).toBeDisabled();
    expect(within(page).getByText("Activez d’abord les devises ou les objets.")).toBeInTheDocument();
  });

  it("Échanges : l'option et les échanges entre personas d'un même compte", async () => {
    monter({ enable_economy: true, enable_inventory: true, enable_trades: false, trades_same_account: false } as Partial<World>);
    await ouvrir("Échanges");
    const page = screen.getByRole("region", { name: "Échanges" });
    // Grisée tant que l'option est coupée ; l'interrupteur est remonté à l'activation.
    const memeCompte = () => within(page).getByRole("switch", { name: "Échanges entre personas d’un même compte" });
    expect(memeCompte()).toBeDisabled();

    await userEvent.click(within(page).getByRole("switch", { name: "Activer les échanges" }));
    await waitFor(() => expect(setWorldFeature).toHaveBeenCalledWith("w1", "enable_trades", true));
    await waitFor(() => expect(memeCompte()).toBeEnabled());
    await userEvent.click(memeCompte());
    await waitFor(() => expect(setWorldFeature).toHaveBeenCalledWith("w1", "trades_same_account", true));
  });
});
