import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { World } from "@/types/worlds";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
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

describe("WorldSettingsView — carte et wiki", () => {
  it("montre les deux interrupteurs activés par défaut", async () => {
    monter();
    await userEvent.click(screen.getByRole("tab", { name: "Fonctions" }));

    // Le mock next-intl du dépôt résout les vraies traductions de `fr.json`.
    expect(screen.getByText("Activer la carte")).toBeInTheDocument();
    expect(screen.getByText("Activer le wiki")).toBeInTheDocument();
  });

  it("considère un monde sans la colonne comme activé", async () => {
    // Objet partiel : `enable_map` absent ne doit pas se lire comme « désactivé ».
    monter();
    await userEvent.click(screen.getByRole("tab", { name: "Fonctions" }));

    const interrupteurs = screen.getAllByRole("switch");
    expect(interrupteurs.length).toBeGreaterThan(0);
    for (const s of interrupteurs) expect(s).toBeInTheDocument();
  });

  it("désactive la carte en appelant l'action avec le bon champ", async () => {
    monter({ enable_map: true });
    await userEvent.click(screen.getByRole("tab", { name: "Fonctions" }));

    const ligne = screen.getByText("Activer la carte").closest("div")?.parentElement;
    const interrupteur = ligne?.querySelector('[role="switch"]');
    expect(interrupteur, "interrupteur de la carte introuvable").toBeTruthy();

    await userEvent.click(interrupteur as Element);

    await waitFor(() => {
      expect(setWorldFeature).toHaveBeenCalledWith("w1", "enable_map", false);
    });
  });

  it("désactive le wiki en appelant l'action avec le bon champ", async () => {
    monter({ enable_wiki: true });
    await userEvent.click(screen.getByRole("tab", { name: "Fonctions" }));

    const ligne = screen.getByText("Activer le wiki").closest("div")?.parentElement;
    const interrupteur = ligne?.querySelector('[role="switch"]');
    await userEvent.click(interrupteur as Element);

    await waitFor(() => {
      expect(setWorldFeature).toHaveBeenCalledWith("w1", "enable_wiki", false);
    });
  });

  it("reflète un monde où la carte est déjà désactivée", async () => {
    monter({ enable_map: false });
    await userEvent.click(screen.getByRole("tab", { name: "Fonctions" }));

    const ligne = screen.getByText("Activer la carte").closest("div")?.parentElement;
    const interrupteur = ligne?.querySelector('[role="switch"]');
    expect(interrupteur).toHaveAttribute("aria-checked", "false");
  });
});
