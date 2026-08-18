import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({
    create_chatroom: false,
    world_map: false,
    world_catalogue: false,
    world_timeline: false,
  }),
}));

vi.mock("@/app/(protected)/w/actions", () => ({
  saveWorldPrefs: vi.fn(),
  toggleWorldFavorite: vi.fn(),
}));

vi.mock("@/components/worlds/home/WorldHeroCard", () => ({
  WorldHeroCard: () => <div>hero</div>,
}));

vi.mock("@/components/worlds/chatrooms/WorldChatroomsGrid", () => ({
  WorldChatroomsGrid: () => <div>grid</div>,
}));

vi.mock("@/components/worlds/chatrooms/WorldCategoryFolders", () => ({
  WorldCategoryFolders: () => <div>folders</div>,
}));

vi.mock("@/components/worlds/home/widgets/WorldStatsWidget", () => ({
  WorldStatsWidget: () => <div>stats-widget</div>,
}));

import { WorldHome } from "@/components/worlds/home/WorldHome";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    world: { id: "world-1", name: "Avalonia", description: "Un monde de test", owner_id: "user-1" },
    worldId: "world-1",
    userId: "user-1",
    canAdmin: false,
    isShared: true,
    canEditTabs: false,
    canPost: false,
    initialRooms: [],
    initialPersonas: [],
    initialPrefs: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldHome — titre/description hors bannière + panel de contenu", () => {
  it("pré-dimensionne l'icône du monde via imgproxy et laisse Next.js de côté", () => {
    // Régression : un `sizes` en px fixe (sans `vw`) faisait retomber
    // l'optimiseur de Next.js sur sa plus grande largeur configurée
    // (jusqu'à 3840px) plutôt qu'une taille adaptée — demander à Next
    // d'agrandir une source déjà petite jusque-là échouait purement et
    // simplement au chargement, vérifié en direct dans le navigateur.
    render(
      <WorldHome
        {...baseProps({
          world: {
            id: "world-1",
            name: "Avalonia",
            owner_id: "user-1",
            icon_url: "https://x.supabase.co/storage/v1/object/public/worlds/icon.webp",
          },
        })}
      />,
    );

    const titleBlock = screen.getByRole("heading", { name: "Avalonia" }).closest("div.relative")!;
    const img = titleBlock.querySelector("img")!;
    expect(img).toHaveAttribute("src", expect.stringContaining("width=132"));
    expect(img).toHaveAttribute("src", expect.stringContaining("quality=90"));
    expect(img.getAttribute("src")).not.toContain("/_next/image");
  });

  it("affiche le titre et la description comme contenu de page (plus superposés sur la bannière)", () => {
    render(<WorldHome {...baseProps()} />);

    expect(screen.getByRole("heading", { name: "Avalonia" })).toBeInTheDocument();
    expect(screen.getByText("Un monde de test")).toBeInTheDocument();
  });

  it("n'affiche pas les statistiques quand home_show_stats n'est pas activé", async () => {
    render(<WorldHome {...baseProps({ world: { id: "world-1", name: "Avalonia", owner_id: "user-1", home_layout: ["chatrooms"] } })} />);

    await screen.findByText("grid");
    expect(screen.queryByText("stats-widget")).not.toBeInTheDocument();
  });

  it("affiche les statistiques sous le titre, hors du panel — plus un bloc de la grille", async () => {
    // Ancien comportement (widget "stats" plaçable dans home_layout/la grille)
    // remplacé par une zone fixe pilotée par un simple booléen — voir
    // home_show_stats (WorldHomeGridSettings.tsx dans Réglages > Page d'accueil).
    render(
      <WorldHome
        {...baseProps({
          world: { id: "world-1", name: "Avalonia", owner_id: "user-1", home_layout: ["chatrooms"], home_show_stats: true },
        })}
      />,
    );

    const stats = await screen.findByText("stats-widget");
    const panel = (await screen.findByText("grid")).closest("[data-home-panel]");
    expect(panel).toBeTruthy();
    expect(panel?.contains(stats)).toBe(false);
  });

  it("le panel contient les widgets configurés", async () => {
    render(
      <WorldHome {...baseProps({ world: { id: "world-1", name: "Avalonia", owner_id: "user-1", home_layout: ["chatrooms"] } })} />,
    );

    const panel = (await screen.findByText("grid")).closest("[data-home-panel]");
    expect(panel).toBeTruthy();
  });

  it("garde hauteur de bannière et début du dégradé constants, sans variante par breakpoint", () => {
    // Régression (visible pile à 767px) : le dégradé de WorldHeroCard était
    // codé en dur (10rem → 20rem) alors que la hauteur réservée à la bannière
    // était responsive (pt-40 / md:pt-56). Sous `md`, le conteneur devenait
    // plus court que la fin du dégradé, qui se coupait net avant d'être
    // opaque. Les deux sont désormais constants et déclarés ensemble.
    render(<WorldHome {...baseProps()} />);

    const titleBlock = screen.getByRole("heading", { name: "Avalonia" }).closest("div.relative")!;
    const bannerContainer = titleBlock.parentElement!;

    expect(bannerContainer.className).toContain("[--hero-fade-start:6rem]");
    expect(titleBlock.className).toMatch(/\bpt-40\b/);
    // Aucune variante responsive des deux côtés : c'est leur désaccord qui
    // créait la coupure.
    expect(bannerContainer.className).not.toMatch(/md:\[--hero-fade/);
    expect(titleBlock.className).not.toMatch(/md:pt-/);
    // Présence minimale de la bannière pour un monde sans description.
    expect(bannerContainer.className).toMatch(/\bmin-h-60\b/);
  });

  it("empêche la compression des sections, qui faisait chevaucher le panel et la description", () => {
    // Régression : bloc bannière et panel sont des enfants d'un conteneur
    // flex-col, donc compressibles par défaut. Dès que le contenu dépassait la
    // hauteur du viewport, le bloc bannière était réduit sous sa hauteur
    // naturelle, son contenu débordait, et le panel (qui démarre au bord de la
    // boîte réduite) se superposait à la description.
    render(<WorldHome {...baseProps()} />);

    const titleBlock = screen.getByRole("heading", { name: "Avalonia" }).closest("div.relative")!;
    const bannerContainer = titleBlock.parentElement!;
    const panel = document.querySelector("[data-home-panel]")!.parentElement!;

    expect(bannerContainer.className).toMatch(/\bshrink-0\b/);
    expect(panel.className).toMatch(/\bshrink-0\b/);
  });

  it("laisse les boutons d'en-tête cliquables malgré le padding qui les recouvre", () => {
    // Régression : le bloc titre est `relative` et vient après cette barre
    // dans le DOM — à z-index égal il se peint au-dessus, et son `pt` (zone
    // de padding, qui capte les événements pointeur) recouvrait exactement
    // les boutons, les rendant inertes.
    render(<WorldHome {...baseProps()} />);

    const bar = screen.getByLabelText("Ouvrir le menu").closest("div.absolute")!;
    expect(bar.className).toMatch(/\bz-10\b/);
  });

  it("le bloc titre est positionné (relative) pour se peindre au-dessus du fond absolu de la bannière", () => {
    // Régression : un bloc statique (sans position) se peint SOUS un élément
    // absolute quel que soit son ordre dans le DOM (règles d'empilement CSS)
    // — sans `relative` ici, le titre/description/stats devient invisible,
    // masqué par le dégradé opaque de WorldHeroCard.
    render(<WorldHome {...baseProps()} />);

    const heading = screen.getByRole("heading", { name: "Avalonia" });
    const titleBlock = heading.closest("div.relative");
    expect(titleBlock).not.toBeNull();
  });
});
