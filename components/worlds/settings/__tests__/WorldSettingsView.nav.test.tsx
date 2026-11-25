import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { World } from "@/types/worlds";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

// Permissions et adresse pilotables test par test.
const acces = { perms: new Set<string>(["administrator"]), owner: true };
let params = new URLSearchParams();
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({
    worldId: "w1",
    ownerId: "owner",
    roles: [],
    membership: { userId: "me", isOwner: acces.owner, roles: [], permissions: acces.perms, rank: 1 },
    can: (p: string) => acces.perms.has("administrator") || acces.perms.has(p),
    refresh: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => params,
}));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ public_worlds: true, world_timeline: true, world_map: true }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/worlds/settings/WorldRolesTab", () => ({ WorldRolesTab: () => <div data-testid="roles-tab" /> }));
vi.mock("@/components/worlds/settings/WorldReportsTab", () => ({ WorldReportsTab: () => <div data-testid="reports-tab" /> }));
vi.mock("@/components/worlds/settings/WorldAnnouncementsTab", () => ({
  WorldAnnouncementsTab: () => <div data-testid="announcements-tab" />,
}));
vi.mock("@/components/worlds/settings/announcements/WorldWelcomeSection", () => ({
  WorldWelcomeTab: () => <div data-testid="welcome-tab" />,
}));
vi.mock("@/components/worlds/settings/WorldCommunityTab", () => ({ WorldCommunityTab: () => <div data-testid="community-tab" /> }));
vi.mock("@/components/worlds/settings/WorldPersonaTemplateSection", () => ({ WorldPersonaTemplateSection: () => <div /> }));
vi.mock("@/components/worlds/settings/WorldCategoryManager", () => ({ WorldCategoryManager: () => <div data-testid="categories-tab" /> }));
vi.mock("@/components/worlds/settings/WorldHomeGridSettings", () => ({ WorldHomeGridSettings: () => <div data-testid="home-tab" /> }));
vi.mock("@/components/worlds/settings/WorldRelationsSettings", () => ({ WorldRelationsSettings: () => <div data-testid="relations-tab" /> }));
vi.mock("@/components/worlds/settings/WorldGroupsSettings", () => ({ WorldGroupsSettings: () => <div data-testid="groups-tab" /> }));
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldFeature: vi.fn().mockResolvedValue({ ok: true }),
  setWorldRestriction: vi.fn().mockResolvedValue({ ok: true }),
  setWorldFaceclaims: vi.fn().mockResolvedValue({ ok: true }),
  setWorldRequireFaceclaim: vi.fn().mockResolvedValue({ ok: true }),
  setWorldTimeline: vi.fn().mockResolvedValue({ ok: true }),
}));

import { WorldSettingsView } from "@/components/worlds/settings/WorldSettingsView";

const MONDE = { id: "w1", name: "Veldis", visibility: "private", enable_map: true, enable_wiki: false } as unknown as World;

function monter() {
  const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return render(<WorldSettingsView world={MONDE} />);
}
const nav = () => screen.getByRole("navigation", { name: "Sections des paramètres" });
const groupes = () => within(nav()).getAllByRole("group").map((g) => g.getAttribute("aria-labelledby"));
const entrees = (groupe: string) =>
  within(within(nav()).getByRole("group", { name: groupe })).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
// Les sections en tête du menu, hors de tout groupe.
const enTete = () =>
  within(within(nav()).getByTestId("settings-nav-top")).getAllByRole("button").map((b) => b.getAttribute("aria-label"));

let pushState: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  acces.perms = new Set(["administrator"]);
  acces.owner = true;
  params = new URLSearchParams();
  window.history.replaceState(null, "", "/w/w1?view=settings");
  pushState = vi.spyOn(window.history, "pushState");
});
afterEach(() => pushState.mockRestore());

describe("WorldSettingsView — menu de gauche", () => {
  it("Général et Communauté en tête, hors groupe ; puis quatre groupes, dans l'ordre", () => {
    monter();
    expect(enTete()).toEqual(["Général", "Communauté"]);
    expect(groupes()).toEqual([
      "settings-group-world", "settings-group-features", "settings-group-personas", "settings-group-members",
      "settings-group-communications",
    ]);
    expect(entrees("Monde")).toEqual(["Page d'accueil", "Catégories"]);
    expect(entrees("Fonctions")).toEqual(["Carte", "Wiki", "Chronologie", "Catalogue", "Inventaire"]);
    expect(entrees("Personas")).toEqual(["Fiche par défaut", "Compétences", "Faceclaims", "Groupes", "Relations"]);
    expect(entrees("Membres")).toEqual(["Rôles"]);
    expect(entrees("Communications")).toEqual(["Annonces", "Message de bienvenue", "Signalements"]);
  });

  it("le message de bienvenue a sa propre page, sous la même permission que les annonces", async () => {
    acces.perms = new Set(["members.announce"]);
    acces.owner = false;
    monter();
    expect(groupes()).toEqual(["settings-group-communications"]);
    expect(entrees("Communications")).toEqual(["Annonces", "Message de bienvenue"]);
    await userEvent.click(within(nav()).getByRole("button", { name: "Message de bienvenue" }));
    expect(screen.getByTestId("welcome-tab")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Message de bienvenue" })).toBeInTheDocument();
    expect(pushState).toHaveBeenCalledWith(null, "", "/w/w1?view=settings&section=welcome");
  });

  it("Catalogue : une fonction réservée, marquée « Bientôt », sans interrupteur", async () => {
    monter();
    const entree = within(nav()).getByRole("button", { name: "Catalogue" });
    expect(entree).toHaveAccessibleDescription("Bientôt");
    await userEvent.click(entree);
    expect(screen.getByRole("heading", { name: "Catalogue" })).toBeInTheDocument();
    expect(screen.getByText("Bientôt disponible.")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(pushState).toHaveBeenCalledWith(null, "", "/w/w1?view=settings&section=catalog");
  });

  it("ouvre « Général » d'emblée, avec la zone de danger du propriétaire", () => {
    monter();
    expect(within(nav()).getByRole("button", { name: "Général" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Général" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Zone de danger" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Supprimer le monde" })).toBeInTheDocument();
  });

  it("Général : une section Identité, champs nommés en clair ; la description dit où elle paraît", () => {
    monter();
    const identite = screen.getByRole("region", { name: "Identité" });
    expect(within(identite).getByLabelText("Nom du monde")).toBeInTheDocument();
    expect(within(identite).getByLabelText("Description du monde")).toBeInTheDocument();
    expect(within(identite).getByText("Affichée sur la carte du monde.")).toBeVisible();
    expect(within(identite).queryByTestId("help-hint")).toBeNull();
  });

  it("supprimer le monde passe par une boîte de confirmation", async () => {
    monter();
    await userEvent.click(screen.getByRole("button", { name: "Supprimer le monde" }));
    const boite = screen.getByRole("alertdialog");
    expect(within(boite).getByText(/Cette action est irréversible/)).toBeInTheDocument();
    await userEvent.click(within(boite).getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Rôles : la hiérarchie en sous-titre de la page", async () => {
    monter();
    await userEvent.click(within(nav()).getByRole("button", { name: "Rôles" }));
    expect(screen.getByText(/^Du plus haut au plus bas/)).toBeVisible();
  });

  it("la zone de danger reste au propriétaire", () => {
    acces.owner = false;
    monter();
    expect(screen.queryByRole("region", { name: "Zone de danger" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Supprimer le monde" })).toBeNull();
  });

  it("un membre qui gère les relations voit « Personas › Groupes, Relations », sans les pages du monde", () => {
    acces.perms = new Set(["relations.manage"]);
    acces.owner = false;
    monter();
    expect(groupes()).toEqual(["settings-group-personas"]);
    expect(entrees("Personas")).toEqual(["Groupes", "Relations"]);
  });

  it("un membre qui gère les catégories voit « Monde › Catégories », sans la page d'accueil", () => {
    acces.perms = new Set(["categories.manage"]);
    acces.owner = false;
    monter();
    expect(groupes()).toEqual(["settings-group-world"]);
    expect(entrees("Monde")).toEqual(["Catégories"]);
    expect(screen.getByTestId("categories-tab")).toBeInTheDocument();
  });

  it("un membre qui ne gère que les rôles ne voit que « Membres › Rôles »", () => {
    acces.perms = new Set(["roles.manage"]);
    acces.owner = false;
    monter();
    expect(groupes()).toEqual(["settings-group-members"]);
    expect(entrees("Membres")).toEqual(["Rôles"]);
    expect(screen.getByTestId("roles-tab")).toBeInTheDocument();
  });

  it("choisir une section l'affiche et l'inscrit dans l'adresse", async () => {
    monter();
    await userEvent.click(within(nav()).getByRole("button", { name: "Annonces" }));
    expect(screen.getByTestId("announcements-tab")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Annonces" })).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: "Annonces" })).toHaveAttribute("aria-current", "page");
    expect(pushState).toHaveBeenCalledWith(null, "", "/w/w1?view=settings&section=announcements");
  });

  it("Groupes et Relations portent leur propre titre : pas de doublon", async () => {
    monter();
    await userEvent.click(within(nav()).getByRole("button", { name: "Groupes" }));
    expect(screen.getByTestId("groups-tab")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Groupes" })).toBeNull();
    await userEvent.click(within(nav()).getByRole("button", { name: "Relations" }));
    expect(screen.getByTestId("relations-tab")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Relations" })).toBeNull();
  });

  it("l'adresse ouvre directement sa section", () => {
    params = new URLSearchParams("view=settings&section=relations");
    monter();
    expect(screen.getByTestId("relations-tab")).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: "Relations" })).toHaveAttribute("aria-current", "page");
  });

  it("une section inconnue ou interdite retombe sur la première permise", () => {
    acces.perms = new Set(["roles.manage", "members.announce"]);
    acces.owner = false;
    params = new URLSearchParams("view=settings&section=wiki");
    monter();
    expect(screen.getByTestId("roles-tab")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Wiki" })).toBeNull();
  });

  it("Précédent : la section suit l'historique", async () => {
    monter();
    await userEvent.click(within(nav()).getByRole("button", { name: "Groupes" }));
    expect(screen.getByTestId("groups-tab")).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, "", "/w/w1?view=settings&section=categories");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("categories-tab")).toBeInTheDocument();
  });

  it("mobile : retour au menu depuis une section ouverte par un lien", async () => {
    params = new URLSearchParams("view=settings&section=roles");
    window.history.replaceState(null, "", "/w/w1?view=settings&section=roles");
    monter();
    const contenu = screen.getByTestId("settings-content");
    // Section demandée : le menu se cache sur mobile, la page s'affiche.
    expect(nav().parentElement).toHaveClass("hidden");
    expect(contenu).not.toHaveClass("hidden");
    await userEvent.click(within(contenu).getByRole("button", { name: "Paramètres" }));
    expect(window.location.search).toBe("?view=settings");
    expect(nav().parentElement).not.toHaveClass("hidden");
    expect(contenu).toHaveClass("hidden");
  });
});
