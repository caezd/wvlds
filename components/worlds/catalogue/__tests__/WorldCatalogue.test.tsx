import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Seule la coque à onglets est testée : les listes sont remplacées par des
// stubs qui portent leur type et le décompte reçu, pour vérifier quel panneau
// chaque onglet ouvre et ce que la coque leur transmet.
vi.mock("@/components/worlds/catalogue/CatalogueList", () => ({
  CatalogueList: ({ type, usage }: { type: string; usage: Record<string, number> | null }) => (
    <div data-testid={`list-${type}`} data-usage={usage ? JSON.stringify(usage) : ""} />
  ),
}));
vi.mock("@/components/worlds/catalogue/FaceclaimList", () => ({
  FaceclaimList: () => <div data-testid="list-faceclaims" />,
}));
const getWorldCatalogUsage = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/worldCatalog", () => ({ getWorldCatalogUsage }));

import { WorldCatalogue } from "@/components/worlds/catalogue/WorldCatalogue";

const BASE = {
  worldId: "w1",
  canEdit: false,
  inventoryEnabled: true,
  inventoryRestricted: true,
  skillsEnabled: true,
  skillsRestricted: true,
  faceclaimsEnabled: false,
};

describe("WorldCatalogue — onglets", () => {
  beforeEach(() => {
    getWorldCatalogUsage.mockReset();
    getWorldCatalogUsage.mockResolvedValue({ ok: true, usage: {} });
  });

  it("utilise la barre d'onglets en soulignement partagée", () => {
    render(<WorldCatalogue {...BASE} faceclaimsEnabled />);

    const onglets = screen.getAllByRole("tab");
    expect(onglets).toHaveLength(3);
    // Le même trigger que les paramètres du monde et les fiches de persona,
    // pas la pastille par défaut de components/ui/tabs.tsx.
    for (const o of onglets) expect(o).toHaveAttribute("data-slot", "tab-bar-trigger");
    expect(document.querySelector('[data-slot="tabs-trigger"]')).toBeNull();
  });

  it("masque l'onglet des faceclaims quand la fonction est désactivée", () => {
    render(<WorldCatalogue {...BASE} />);
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByTestId("list-faceclaims")).toBeNull();
  });

  it("ouvre l'inventaire par défaut, ou les compétences s'il est désactivé", () => {
    const { unmount } = render(<WorldCatalogue {...BASE} />);
    expect(screen.getByTestId("list-inventory")).toBeInTheDocument();
    expect(screen.queryByTestId("list-skills")).toBeNull();
    unmount();

    render(<WorldCatalogue {...BASE} inventoryEnabled={false} />);
    expect(screen.getByTestId("list-skills")).toBeInTheDocument();
    expect(screen.queryByTestId("list-inventory")).toBeNull();
  });

  it("change de panneau au clic sur un onglet", async () => {
    const user = userEvent.setup();
    render(<WorldCatalogue {...BASE} faceclaimsEnabled />);

    await user.click(screen.getAllByRole("tab")[2]);
    expect(screen.getByTestId("list-faceclaims")).toBeInTheDocument();
    expect(screen.queryByTestId("list-inventory")).toBeNull();
  });

  it("dit l'état de chaque catalogue par un cadenas dans son onglet", () => {
    render(<WorldCatalogue {...BASE} inventoryRestricted={false} skillsEnabled={false} />);

    const [objets, competences] = screen.getAllByRole("tab");
    expect(objets).toContainElement(screen.getByRole("img", { name: "Objets : saisie libre (catalogue non restreint)" }));
    expect(competences).toContainElement(screen.getByRole("img", { name: "Compétences désactivées dans ce monde" }));
  });

  it("charge le décompte d'usage une seule fois et le transmet aux deux listes", async () => {
    getWorldCatalogUsage.mockResolvedValue({ ok: true, usage: { i1: 3 } });
    render(<WorldCatalogue {...BASE} />);

    await waitFor(() =>
      expect(screen.getByTestId("list-inventory")).toHaveAttribute("data-usage", JSON.stringify({ i1: 3 })),
    );
    expect(getWorldCatalogUsage).toHaveBeenCalledTimes(1);
    expect(getWorldCatalogUsage).toHaveBeenCalledWith("w1");
  });
});
