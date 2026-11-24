import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Seule la coque est testée : la liste est remplacée par un stub qui porte
// son type et le décompte reçu, pour vérifier ce que la vue lui transmet.
vi.mock("@/components/worlds/catalogue/CatalogueList", () => ({
  CatalogueList: ({ type, usage }: { type: string; usage: Record<string, number> | null }) => (
    <div data-testid={`list-${type}`} data-usage={usage ? JSON.stringify(usage) : ""} />
  ),
}));
const getWorldCatalogUsage = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/worldCatalog", () => ({ getWorldCatalogUsage }));
// Le catalogue résout les [[liens]] du wiki (migration 186) : le fournisseur
// lit les pages du monde et le routeur — hors sujet ici.
vi.mock("@/components/worlds/wiki/WikiLinkContext", () => ({
  WikiLinkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWikiLinks: () => null,
}));

import { WorldCatalogue } from "@/components/worlds/catalogue/WorldCatalogue";

const BASE = { worldId: "w1", canEdit: false, enabled: true, restricted: true };

describe("WorldCatalogue — une vue par type d'entrée", () => {
  beforeEach(() => {
    getWorldCatalogUsage.mockReset();
    getWorldCatalogUsage.mockResolvedValue({ ok: true, usage: {} });
  });

  it("Objets : la seule liste des objets, sans onglets", () => {
    render(<WorldCatalogue {...BASE} type="inventory" />);
    expect(screen.getByText("Objets")).toBeInTheDocument();
    expect(screen.getByTestId("list-inventory")).toBeInTheDocument();
    expect(screen.queryByTestId("list-skills")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("Compétences : la seule liste des compétences", () => {
    render(<WorldCatalogue {...BASE} type="skills" />);
    expect(screen.getByText("Compétences")).toBeInTheDocument();
    expect(screen.getByTestId("list-skills")).toBeInTheDocument();
    expect(screen.queryByTestId("list-inventory")).toBeNull();
  });

  it("dit l'état du catalogue par un cadenas à côté du titre", () => {
    const { unmount } = render(<WorldCatalogue {...BASE} type="inventory" restricted={false} />);
    expect(screen.getByRole("img", { name: "Objets : les joueurs créent aussi leurs propres objets." })).toBeInTheDocument();
    unmount();
    render(<WorldCatalogue {...BASE} type="skills" enabled={false} />);
    expect(screen.getByRole("img", { name: "Compétences désactivées dans ce monde" })).toBeInTheDocument();
  });

  it("charge le décompte d'usage une fois et le transmet à la liste", async () => {
    getWorldCatalogUsage.mockResolvedValue({ ok: true, usage: { i1: 3 } });
    render(<WorldCatalogue {...BASE} type="inventory" />);

    await waitFor(() =>
      expect(screen.getByTestId("list-inventory")).toHaveAttribute("data-usage", JSON.stringify({ i1: 3 })),
    );
    expect(getWorldCatalogUsage).toHaveBeenCalledTimes(1);
    expect(getWorldCatalogUsage).toHaveBeenCalledWith("w1");
  });
});
