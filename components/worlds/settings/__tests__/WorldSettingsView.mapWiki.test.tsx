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
  useFeatureFlags: () => ({ public_worlds: false, world_timeline: false, world_map: true }),
}));
vi.mock("@/components/worlds/settings/WorldPersonaTemplateSection", () => ({
  WorldPersonaTemplateSection: () => <div data-testid="persona-template" />,
}));
vi.mock("@/components/worlds/settings/WorldCatalogBoardSection", () => ({
  WorldCatalogBoardSection: ({ worldId, type }: { worldId: string; type: string }) => (
    <p>{type === "skills" ? "compétences" : "objets"} du monde {worldId}</p>
  ),
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

/** Ouvre une page « Fonctions » depuis le menu de gauche. */
async function ouvrir(categorie: "Carte" | "Wiki") {
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

  it("les pages « Fonctions » dans le menu de gauche, chacune avec son état ; une seule page visible", async () => {
    monter({ enable_map: true, enable_wiki: false });
    const nav = screen.getByRole("navigation", { name: "Sections des paramètres" });
    const fonctions = within(nav).getByRole("group", { name: "Fonctions" });
    expect(within(fonctions).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(
      ["Carte", "Wiki", "Catalogue", "Inventaire"],
    );
    // Chaque fonction porte son état : une icône, lue en description.
    expect(within(nav).getByRole("button", { name: "Carte" })).toHaveAccessibleDescription("Activé");
    expect(within(nav).getByRole("button", { name: "Wiki" })).toHaveAccessibleDescription("Désactivé");

    // « Général » d'emblée : aucune page « Fonctions » visible.
    expect(within(nav).getByRole("button", { name: "Général" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("region", { name: "Inventaire" })).toBeNull();

    await userEvent.click(within(nav).getByRole("button", { name: "Inventaire" }));
    expect(within(nav).getByRole("button", { name: "Inventaire" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("region", { name: "Inventaire" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Carte" })).toBeNull();

    await userEvent.click(within(nav).getByRole("button", { name: "Carte" }));
    expect(screen.getByRole("region", { name: "Carte" })).toBeVisible();
    // Le titre monte dans la barre d'en-tête (« Paramètres › Carte ») ; l'interrupteur reste dans la page.
    const titre = screen.getByTestId("settings-header-title");
    expect(within(titre).getByRole("heading", { name: "Carte" })).toBeInTheDocument();
    expect(within(titre).queryByRole("heading", { name: "Inventaire" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Carte" })).getByRole("switch", { name: "Activer la carte" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("region", { name: "Inventaire" })).toBeNull();
  });

  it("objets : une fonction coupée se dit en une tuile ; ses réglages, repliés, restent inertes ; l'interrupteur de la page l'active", async () => {
    monter({ enable_inventory: false } as Partial<World>);
    await userEvent.click(screen.getByRole("button", { name: "Inventaire" }));
    const page = screen.getByRole("region", { name: "Inventaire" });
    const interrupteur = within(page).getByRole("switch", { name: "Activer l’inventaire" });
    expect(interrupteur).toHaveAttribute("aria-checked", "false");
    const tuile = within(page).getByTestId("feature-off");
    expect(within(tuile).getByText("Cette fonction est désactivée.")).toBeInTheDocument();
    // L'aperçu replié : les réglages se lisent, mais ne se changent pas.
    await userEvent.click(within(tuile).getByText("Voir ses réglages"));
    expect(within(page).getByRole("radio", { name: /^Libre/ })).toBeDisabled();
    expect(within(page).getByRole("spinbutton", { name: "Emplacements de départ" })).toBeDisabled();
    await userEvent.click(interrupteur);
    await waitFor(() => expect(setWorldFeature).toHaveBeenCalledWith("w1", "enable_inventory", true));
  });

  it("Personas : une catégorie à part, cinq pages (fiche par défaut, compétences, faceclaims, groupes, relations)", () => {
    monter();
    const nav = screen.getByRole("navigation", { name: "Sections des paramètres" });
    const personas = within(nav).getByRole("group", { name: "Personas" });
    expect(within(personas).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(
      ["Fiche par défaut", "Compétences", "Faceclaims", "Groupes", "Relations"],
    );
    // Les pages « Fonctions » y gardent leur état.
    expect(within(personas).getByRole("button", { name: "Compétences" })).toHaveAccessibleDescription("Activé");
  });

  it("Fiche par défaut : le modèle de fiche, sans les compétences ni les faceclaims", async () => {
    monter({ enable_skills: true, enable_faceclaims: true } as Partial<World>);
    await userEvent.click(screen.getByRole("button", { name: "Fiche par défaut" }));
    const page = screen.getByRole("region", { name: "Fiche par défaut" });
    expect(within(page).getByTestId("persona-template")).toBeInTheDocument();
    expect(within(page).queryByRole("switch")).toBeNull();
  });

  it("Compétences : l'interrupteur, la restriction aux compétences du monde et le tableau des compétences", async () => {
    monter({ enable_skills: true } as Partial<World>);
    await userEvent.click(screen.getByRole("button", { name: "Compétences" }));
    const page = screen.getByRole("region", { name: "Compétences" });
    expect(page).toHaveAttribute("data-fill-page");
    expect(screen.getByRole("switch", { name: "Activer les compétences" })).toHaveAttribute("aria-checked", "true");
    expect(within(page).getByRole("switch", { name: "Compétences : Restreindre aux compétences du monde" })).toBeEnabled();
    expect(within(page).getByText("compétences du monde w1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Activer les compétences" }));
    await waitFor(() => expect(setWorldFeature).toHaveBeenCalledWith("w1", "enable_skills", false));
  });

  it("Faceclaims : l'interrupteur et le faceclaim obligatoire, inerte quand ils sont coupés", async () => {
    monter({ enable_faceclaims: false } as Partial<World>);
    await userEvent.click(screen.getByRole("button", { name: "Faceclaims" }));
    const page = screen.getByRole("region", { name: "Faceclaims" });
    expect(screen.getByRole("switch", { name: "Activer les faceclaims" })).toHaveAttribute("aria-checked", "false");
    await userEvent.click(within(page).getByText("Voir ses réglages"));
    expect(within(page).getByRole("switch", { name: "Faceclaim obligatoire" })).toBeDisabled();
  });
});
