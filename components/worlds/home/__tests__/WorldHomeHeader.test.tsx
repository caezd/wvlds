import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/providers/MobileSidebarProvider", () => ({
  useMobileSidebar: () => ({ setDrawerOpen: vi.fn() }),
}));

const heroCard = vi.fn();
vi.mock("@/components/worlds/home/WorldHeroCard", () => ({
  WorldHeroCard: (props: { blurred?: boolean }) => {
    heroCard(props);
    return <div data-testid="hero" />;
  },
}));

import { WorldHomeHeader } from "@/components/worlds/home/WorldHomeHeader";

const world = { name: "Avalonia", icon_url: null, visibility: "public", banner_url: "https://x/b.png", color: null } as const;

function renderHeader(overrides: Partial<React.ComponentProps<typeof WorldHomeHeader>> = {}) {
  const props = {
    world,
    condensed: false,
    isFavorite: false,
    onToggleFavorite: vi.fn(),
    onOpenSearch: vi.fn(),
    ...overrides,
  };
  render(<WorldHomeHeader {...props} />);
  return props;
}

describe("WorldHomeHeader", () => {
  it("au repos, ne montre que les boutons sur la bannière floutée : le nom reste invisible", () => {
    renderHeader();

    const bar = screen.getByLabelText("Ouvrir le menu").closest("[data-world-home-header]")!;
    expect(bar).not.toHaveAttribute("data-condensed");
    // Le titre est présent (transition d'opacité) mais masqué et hors du
    // flux d'accessibilité.
    const title = screen.getByText("Avalonia").parentElement!;
    expect(title.className).toMatch(/\bopacity-0\b/);
    expect(title.className).toMatch(/\bpointer-events-none\b/);
    expect(title).toHaveAttribute("aria-hidden", "true");
  });

  it("a toujours pour fond la même bannière floutée, sans dégradé — jamais transparente", () => {
    renderHeader();

    const background = screen.getByTestId("hero").parentElement!;
    expect(background.className).not.toMatch(/opacity-0/);
    // Même image que la bannière (cache navigateur), en variante floutée.
    expect(heroCard).toHaveBeenCalledWith(expect.objectContaining({ world, blurred: true }));
    // Voile uni, pas de dégradé.
    expect(background.querySelector("[class*='gradient']")).toBeNull();
  });

  it("une fois le titre de la page défilé, révèle le nom du monde", () => {
    renderHeader({ condensed: true });

    const bar = screen.getByLabelText("Ouvrir le menu").closest("[data-world-home-header]")!;
    expect(bar).toHaveAttribute("data-condensed", "true");
    const title = screen.getByText("Avalonia").parentElement!;
    expect(title.className).toMatch(/\bopacity-100\b/);
    expect(title).not.toHaveAttribute("aria-hidden", "true");
  });

  it("relaie recherche et favori", async () => {
    const user = userEvent.setup();
    const { onOpenSearch, onToggleFavorite } = renderHeader();

    await user.click(screen.getByLabelText("Rechercher"));
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByLabelText("Ajouter aux favoris"));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
  });

  it("reflète l'état favori dans le libellé", () => {
    renderHeader({ isFavorite: true });

    expect(screen.getByLabelText("Retirer des favoris")).toBeInTheDocument();
  });
});
