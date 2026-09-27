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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ public_worlds: false, world_timeline: false, world_map: true }),
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
// Carte et wiki activables par monde. Jusqu'ici la carte ne dépendait que du
// drapeau GLOBAL `world_map`, et le wiki de rien : tous les mondes les
// exposaient, qu'ils s'en servent ou non.
//
// La colonne est `NOT NULL DEFAULT true` en base, mais le composant reçoit
// parfois un monde partiel où elle n'a pas été chargée : la lecture se fait
// donc par `!== false`, et c'est ce que ces tests fixent.
// ──────────────────────────────────────────────────────────────────────────

/** Ouvre l'onglet Fonctions, puis une catégorie de la colonne de gauche. */
async function ouvrir(categorie: "Carte" | "Wiki") {
  await userEvent.click(screen.getByRole("tab", { name: "Fonctions" }));
  await userEvent.click(screen.getByRole("button", { name: categorie }));
}

describe("WorldSettingsView — carte et wiki", () => {
  it("montre les deux interrupteurs activés par défaut", async () => {
    monter();
    await ouvrir("Carte");
    // Le mock next-intl du dépôt résout les vraies traductions de `fr.json`.
    expect(screen.getByRole("switch", { name: "Activer la carte" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: "Wiki" }));
    expect(screen.getByRole("switch", { name: "Activer le wiki" })).toHaveAttribute("aria-checked", "true");
  });

  it("considère un monde sans la colonne comme activé", async () => {
    // Objet partiel : `enable_map` absent ne doit pas se lire comme « désactivé ».
    monter();
    await ouvrir("Carte");
    expect(screen.getByRole("switch", { name: "Activer la carte" })).toHaveAttribute("aria-checked", "true");
  });

  it("désactive la carte en appelant l'action avec le bon champ", async () => {
    monter({ enable_map: true });
    await ouvrir("Carte");
    await userEvent.click(screen.getByRole("switch", { name: "Activer la carte" }));
    await waitFor(() => {
      expect(setWorldFeature).toHaveBeenCalledWith("w1", "enable_map", false);
    });
  });

  it("désactive le wiki en appelant l'action avec le bon champ", async () => {
    monter({ enable_wiki: true });
    await ouvrir("Wiki");
    await userEvent.click(screen.getByRole("switch", { name: "Activer le wiki" }));
    await waitFor(() => {
      expect(setWorldFeature).toHaveBeenCalledWith("w1", "enable_wiki", false);
    });
  });

  it("reflète un monde où la carte est déjà désactivée", async () => {
    monter({ enable_map: false });
    await ouvrir("Carte");
    expect(screen.getByRole("switch", { name: "Activer la carte" })).toHaveAttribute("aria-checked", "false");
  });

  it("les catégories à gauche, chacune avec son état ; la page de la catégorie choisie à droite", async () => {
    monter({ enable_map: true, enable_wiki: false });
    await userEvent.click(screen.getByRole("tab", { name: "Fonctions" }));
    const nav = screen.getByRole("navigation", { name: "Catégories de fonctions" });
    expect(within(nav).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(
      expect.arrayContaining(["Catalogue", "Carte", "Wiki", "Personas"]),
    );
    // L'état se lit en description : « Actif » ou « Off ».
    expect(within(nav).getByRole("button", { name: "Carte" })).toHaveAccessibleDescription("Actif");
    expect(within(nav).getByRole("button", { name: "Wiki" })).toHaveAccessibleDescription("Off");

    // Le catalogue d'emblée ; une seule page visible à la fois.
    expect(within(nav).getByRole("button", { name: "Catalogue" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("region", { name: "Catalogue" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Carte" })).toBeNull();

    await userEvent.click(within(nav).getByRole("button", { name: "Carte" }));
    const carte = screen.getByRole("region", { name: "Carte" });
    expect(within(carte).getByRole("heading", { name: /Carte/ })).toBeInTheDocument();
    // L'interrupteur encadré de l'en-tête dit l'état, et le change.
    expect(within(carte).getByText("Activée")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Catalogue" })).toBeNull();
  });
});
